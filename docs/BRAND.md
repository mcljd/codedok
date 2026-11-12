# CodedOK brand colours

Three colours. One accent. Use it sparingly.

| Name | Hex | Use for |
|---|---|---|
| **Egyptian Blue** | `#03203D` | The brand. Backgrounds, headers, primary buttons in the app, the logo. |
| **Stone Blue** | `#639CC5` | Supporting colour. Highlights, active states, secondary buttons, soft fills. |
| **Scarlet** | `#EB2F33` | The one accent. Headlines and call-to-action buttons on the website, ads and App Store shots. |

Supporting shades (already in `app/style.css`): darker stone `#3A78A6` / `#4F88B3`
for text and hover states on white; light stone `#9CC3E0` for text on navy.

## The one rule

**Inside the app, scarlet means "overdue" — nothing else.** No scarlet
buttons or decoration in the app, or users will start reading every button
as a warning. (The in-app overdue shade is `#D3262A`, a touch deeper than
`#EB2F33` so small text stays readable.)

On marketing (website, ads, social, App Store screenshots) scarlet is the
headline highlight and the main button — one scarlet thing per screen.

## Don't

- Add new colours. Green and amber stay only for "valid" and "due soon" status.
- Put scarlet text on stone blue (poor contrast).
- Use stone blue for body text on white — use `#3A78A6` instead.
