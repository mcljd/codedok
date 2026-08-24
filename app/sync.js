// CodedOK — offline-first sync layer.
//
// Strategy:
//   - localStorage is the source of truth on the device (fast, offline-safe)
//   - Supabase is the cloud source of truth
//   - On every Store.save(), changed rows queue for push
//   - When online + signed in, push the queue, then pull anything new
//   - Conflict resolution: last-write-wins by updated_at
//
// What's here:
//   - Sync.start()                — kicks off auto-sync (online + every 60s)
//   - Sync.now()                  — flush queue + pull, returns when done
//   - Sync.queueWrite(table, row) — called by a wrapped Store.save()
//
// What's NOT here yet (room to grow):
//   - Realtime subscriptions for surveyor signing → operator's phone
//   - File uploads (vessel photos / surveyor logos) → Supabase Storage
//   - Edge-function-backed AI SMS generation (replacement for the mock)
//
// Wiring: load AFTER supabase-client.js + store.js, BEFORE app.js.

(function () {
  'use strict';

  // Tables we sync, in dependency order (parents before children).
  // Same names as the localStorage Store collections.
  const TABLES = [
    'users', 'organizations', 'memberships',
    'vessels', 'certs', 'equipment', 'deficiencies', 'inspections',
    'crew', 'crewCerts',          // -> crew_certs on the server
    'surveyor_grants',
    'sms_documents',
    'jobs', 'invoices'
  ];

  // Server column for table name where it differs from the local key.
  const SERVER_TABLE = {
    crewCerts: 'crew_certs'
  };
  function serverTable(t) { return SERVER_TABLE[t] || t; }

  const QUEUE_KEY = 'codedok-sync-queue';
  const LAST_PULL_KEY = 'codedok-sync-last-pull';
  let timer = null;
  let inFlight = false;
  let online = (typeof navigator !== 'undefined') ? navigator.onLine !== false : true;

  function loadQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
    catch (_) { return []; }
  }
  function saveQueue(q) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }
  function pushQueue(item) {
    const q = loadQueue();
    // Coalesce: drop earlier writes to the same (table, id) — newest wins.
    const filtered = q.filter((x) => !(x.table === item.table && x.id === item.id));
    filtered.push(item);
    saveQueue(filtered);
  }

  // Called by a wrapped Store.save (see initStoreWrap below).
  // Always stamps updated_at on the row so the server / pullChanges
  // last-write-wins comparison has something to work with — local
  // mutations don't otherwise set it.
  function queueWrite(table, row) {
    if (!row || !row.id) return;
    const stampedRow = Object.assign({}, row, {
      updated_at: row.updated_at || new Date().toISOString()
    });
    pushQueue({
      table,
      id: row.id,
      op: row.deleted_at ? 'delete' : 'upsert',
      row: stampedRow,
      at: new Date().toISOString()
    });
    emitStatus();
  }

  async function flushQueue() {
    if (!window.Supa || !window.Supa.ready) return;
    const client = await window.Supa.getClient();
    const queue = loadQueue();
    if (queue.length === 0) return;

    const remaining = [];
    for (const item of queue) {
      try {
        const table = serverTable(item.table);
        if (item.op === 'delete') {
          await client.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', item.id);
        } else {
          await client.from(table).upsert(item.row, { onConflict: 'id' });
        }
      } catch (err) {
        // Network blip — keep in queue and try again next pass.
        console.warn('sync push failed for', item.table, item.id, err.message);
        remaining.push(item);
      }
    }
    saveQueue(remaining);
  }

  async function pullChanges() {
    if (!window.Supa || !window.Supa.ready || !window.Store) return;
    const client = await window.Supa.getClient();
    const since = localStorage.getItem(LAST_PULL_KEY) || '1970-01-01T00:00:00Z';
    const newSince = new Date().toISOString();
    const state = Store.snapshot();

    for (const localKey of TABLES) {
      const table = serverTable(localKey);
      try {
        // memberships is a join table with a composite key (org_id,
        // user_id) and NO id / updated_at / deleted_at columns — so it
        // can't use the id-keyed, updated_at-cursored path the other
        // tables do (ordering by updated_at 400s: "column
        // memberships.updated_at does not exist"). Pull it whole and
        // dedupe on the composite key. It's a tiny table, so pulling
        // every row each pass is cheap. Rows arrive server-side via
        // accept_invitation; owners already hold theirs locally.
        if (localKey === 'memberships') {
          const { data, error } = await client
            .from(table)
            .select('*')
            .order('created_at', { ascending: true })
            .limit(500);
          if (error) throw error;
          if (!data || data.length === 0) continue;
          const collection = state[localKey] || [];
          const sameMember = (a, b) => a.org_id === b.org_id && a.user_id === b.user_id;
          for (const row of data) {
            const idx = collection.findIndex((x) => sameMember(x, row));
            if (idx >= 0) collection[idx] = row;
            else collection.push(row);
          }
          state[localKey] = collection;
          continue;
        }

        const { data, error } = await client
          .from(table)
          .select('*')
          .gt('updated_at', since)
          .order('updated_at', { ascending: true })
          .limit(500);
        if (error) throw error;
        if (!data || data.length === 0) continue;

        const collection = state[localKey] || [];
        for (const row of data) {
          if (row.deleted_at) {
            // Apply tombstone — remove from local collection.
            const idx = collection.findIndex((x) => x.id === row.id);
            if (idx >= 0) collection.splice(idx, 1);
          } else {
            const idx = collection.findIndex((x) => x.id === row.id);
            if (idx >= 0) {
              // Last-write-wins by updated_at.
              const local = collection[idx];
              if (!local.updated_at || new Date(row.updated_at) >= new Date(local.updated_at)) {
                collection[idx] = row;
              }
            } else {
              collection.push(row);
            }
          }
        }
        state[localKey] = collection;
      } catch (err) {
        console.warn('sync pull failed for', localKey, err.message);
      }
    }

    // Persist back to localStorage.
    if (Store._persist) Store._persist(state);
    else localStorage.setItem('codedok-v2', JSON.stringify(state));

    localStorage.setItem(LAST_PULL_KEY, newSince);
  }

  async function now() {
    if (inFlight || !online) return;
    inFlight = true;
    emitStatus();
    try {
      await flushQueue();
      await pullChanges();
    } finally {
      inFlight = false;
      emitStatus();
    }
  }

  // Broadcast the current status to any UI listeners (offline badge etc).
  // Cheap to call — listeners decide whether anything actually changed.
  function emitStatus() {
    if (typeof window === 'undefined' || !window.dispatchEvent) return;
    try {
      window.dispatchEvent(new CustomEvent('codedok-sync', {
        detail: {
          online,
          inFlight,
          pending: loadQueue().length,
          ready: !!(window.Supa && window.Supa.ready),
          lastPullAt: localStorage.getItem(LAST_PULL_KEY)
        }
      }));
    } catch (_) {}
  }

  function start() {
    if (timer) return;
    if (typeof window !== 'undefined') {
      window.addEventListener('online',  () => { online = true;  emitStatus(); now(); });
      window.addEventListener('offline', () => { online = false; emitStatus(); });
    }
    timer = setInterval(now, 60 * 1000);     // every 60 seconds
    setTimeout(now, 1500);                   // initial pass shortly after load
    setTimeout(emitStatus, 100);             // surface initial state to UI
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  // ---- Wrap Store.save so every write queues for sync ----
  function initStoreWrap() {
    if (!window.Store) return;
    if (window.Store._wrappedForSync) return;

    // The current Store doesn't expose per-row save — it persists whole
    // state. Until we refactor, intercept the public mutators we care
    // about. Each one returns the new row, so we queue it.
    const fan = [
      // Vessels
      ['addVessel',       'vessels'],
      ['updateVessel',    'vessels'],
      ['deleteVessel',    'vessels'],
      ['setVesselPhoto',  'vessels'],
      // Certs + equipment
      ['addCert',         'certs'],
      ['updateCert',      'certs'],
      ['deleteCert',      'certs'],
      ['attachFileToCert',     'certs'],
      ['detachFileFromCert',   'certs'],
      ['addEquipment',    'equipment'],
      ['attachFileToEquipment',   'equipment'],
      ['detachFileFromEquipment', 'equipment'],
      ['recordEquipmentService',  'equipment'],
      // Deficiencies + inspections
      ['addDeficiency',   'deficiencies'],
      ['resolveDeficiency','deficiencies'],
      ['startInspection',     'inspections'],
      ['completeInspection',  'inspections'],
      // Crew
      ['addCrew',         'crew'],
      ['assignCrewToVessel',   'crew'],
      ['removeCrewFromVessel', 'crew'],
      ['updateCrewRole',  'crew'],
      ['addCrewCert',     'crewCerts'],
      // SMS
      ['addSmsDocument',  'sms_documents'],
      ['updateSmsDocument','sms_documents'],
      ['deliverSmsToOperator','sms_documents'],
      ['ackSms',          'sms_documents'],
      ['revokeSmsAck',    'sms_documents'],
      ['createSmsShareToken', 'sms_documents'],
      ['appendSmsEdit',   'sms_documents'],
      // Jobs + invoices
      ['createJob',       'jobs'],
      ['quoteJob',        'jobs'],
      ['declineJob',      'jobs'],
      ['startJob',        'jobs'],
      ['completeJob',     'jobs'],
      ['deliverJob',      'jobs'],
      ['payInvoice',      'invoices'],
      // Surveyor grants
      ['inviteSurveyor',  'surveyor_grants'],
      ['revokeSurveyor',  'surveyor_grants'],
      // User profile
      ['setSurveyorLogo', 'users']
    ];
    for (const [fn, table] of fan) {
      const orig = Store[fn];
      if (typeof orig !== 'function') continue;
      Store[fn] = function () {
        const result = orig.apply(Store, arguments);
        try {
          if (table === 'vessels' && fn === 'deleteVessel') {
            // delete by id (first arg)
            queueWrite('vessels', { id: arguments[0], deleted_at: new Date().toISOString() });
          } else if (result && result.id) {
            queueWrite(table, result);
          } else if (table === 'sms_documents' && arguments[0]) {
            // Mutations like ackSms / appendSmsEdit return the change, not the doc.
            // Look up the doc and queue its full row.
            const doc = (Store.snapshot().sms_documents || []).find((d) => d.id === arguments[0]);
            if (doc) queueWrite('sms_documents', doc);
          }
        } catch (e) { console.warn('sync queue error', e); }
        return result;
      };
    }

    window.Store._wrappedForSync = true;
  }

  // ---- Public API ----
  window.Sync = {
    start,
    stop,
    now,
    queueWrite,
    queueLength: () => loadQueue().length,
    status: () => ({
      online,
      inFlight,
      ready: !!(window.Supa && window.Supa.ready),
      pending: loadQueue().length,
      lastPullAt: localStorage.getItem(LAST_PULL_KEY)
    })
  };

  // Auto-start on DOMContentLoaded if Supabase is configured.
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      initStoreWrap();
      if (window.Supa && (window.CodedOkConfig || {}).supabaseUrl) {
        start();
      }
    });
  }
})();
