// codedok-tailwind.js
// Drop this into your tailwind.config.js as a preset or extend block

module.exports = {
  theme: {
    extend: {
      colors: {
        navy: {
          deep:  '#0a1628',
          mid:   '#1a3560',
          light: '#1e3454',
        },
        cyan: {
          DEFAULT: '#0891b2',
          light:   '#06b6d4',
          pale:    'rgba(8,145,178,0.12)',
        },
        green: {
          compliance: '#16a34a',
          pale:       'rgba(22,163,74,0.12)',
        },
        amber: {
          brand: '#d4a017',
          pale:  'rgba(212,160,23,0.14)',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', "'Segoe UI'", 'Helvetica', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        'brand-sm': '8px',
        'brand-md': '12px',
        'brand-lg': '16px',
        'brand-xl': '20px',
      },
      boxShadow: {
        'brand-sm': '0 1px 3px rgba(0,0,0,0.06), 0 1px 8px rgba(0,0,0,0.06)',
        'brand-md': '0 2px 16px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)',
        'brand-lg': '0 8px 40px rgba(0,0,0,0.14)',
      },
    },
  },
}
