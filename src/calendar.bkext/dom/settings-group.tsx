import { Button } from 'bike/components'

/**
 * The two controls every built-in settings group carries in its header: reset
 * on the left, help on the right.
 *
 * Help is an anchor rather than a `Button` because the settings web view turns
 * any http(s) link click into an `NSWorkspace.open` — so there's no app round
 * trip to arrange and no `openURL` permission needed by whichever extension
 * draws it. It borrows the button classes to match the one beside it, and the
 * inline overrides make it the round `?` macOS uses for help everywhere else.
 *
 * Copy of the same file in `bike.bkext/dom` — extensions are separate
 * bundles, so there is nowhere to share it from short of `bike/components`.
 *
 * Belongs in the disclosure's TRAILING accessory: the leading slot renders
 * inside the header's toggle button, where a nested button and anchor would be
 * both invalid and unclickable.
 */
export function SettingsGroupAccessory({
  canReset,
  onReset,
  helpURL,
  helpTitle,
}: {
  /** Whether anything in the group differs from its default. */
  canReset: boolean
  onReset: () => void
  helpURL: string
  /** Names the page for the tooltip and for a screen reader. */
  helpTitle: string
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      {/* Nothing to reset is the ordinary state, and a button that does nothing
          shouldn't look like it might. Disabled says as much, and doubles as
          the answer to "have I changed anything in here?". */}
      <Button size="mini" disabled={!canReset} onClick={onReset}>
        Reset Settings
      </Button>
      <a className="bike-button bike-button--mini" style={HELP_STYLE} href={helpURL} title={helpTitle} aria-label={helpTitle}>
        ?
      </a>
    </span>
  )
}

// Square it off into a circle, and take back the link color `common.css` gives
// every anchor — this one is a button, and reads as one.
const HELP_STYLE: React.CSSProperties = {
  width: '16px',
  padding: 0,
  borderRadius: '50%',
  color: 'var(--label)',
  textDecoration: 'none',
}
