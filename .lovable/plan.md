# Mobile viewport containment fix

## Scope
- Update the main header so the brand and menu control fit one phone-width row.
- Keep all existing navigation actions unchanged, but place them behind an accessible Menu/X toggle below `lg`; retain the current inline desktop navigation.
- Make the expanded mobile actions wrap within the viewport and cap their height with internal scrolling.
- Update the company identity row to wrap on phones and let the company selector use the full available mobile width while preserving its desktop maximum width.
- Add containment rules only inside `.operations-workspace`: shrink nested grid/form controls, wrap long content, constrain small-screen controls and media, and prevent iOS input zoom with 16px form text.

## Validation
- Run the project type checker and build.
- Inspect representative phone widths for horizontal overflow, menu accessibility/state, wrapped company header behavior, and visible controls.

## Constraints
- No business logic, permissions, data, database, workflow, or publishing changes.
- Do not hide overflow globally or clip interactive controls.
