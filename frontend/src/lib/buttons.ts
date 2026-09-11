/**
 * Shared button styling for the whole app — matches the top navigation bar
 * buttons (Change Password / Sign Out): white fill, navy text + navy border,
 * rounded corners, medium weight.
 *
 * Spread into a button's style to allow spacing overrides, e.g.
 *   style={{ ...BUTTON_STYLE, marginRight: 4 }}
 */
export const NAVY = "#1e3a8a";

export const BUTTON_STYLE = {
    background: "#fff",
    color: NAVY,
    border: `1px solid ${NAVY}`,
    padding: "5px 14px",
    fontSize: 13,
    fontWeight: 500,
    borderRadius: 4,
    cursor: "pointer",
} as const;