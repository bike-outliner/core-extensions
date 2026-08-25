import { DOMExtensionContext } from 'bike/dom'
import { Checkbox, Disclosure, Label } from 'bike/components'
import { createRoot } from 'react-dom/client'
import { Fragment, useEffect, useId, useState } from 'react'
import { SettingsGroupAccessory } from './settings-group'
import {
  ATTRIBUTE_COLUMNS,
  ATTRIBUTE_OVERRIDES_KEY,
  AttributeColumn,
  AttributeOverrides,
  AttributeRow,
  AttributesProtocol,
  readOverrides,
  withCell,
} from './protocols'

// One `settings.addItem` per section, each in its own file — see TasksSettings.

export function activate(context: DOMExtensionContext<AttributesProtocol>) {
  createRoot(context.element).render(<AttributesSection context={context} />)
}

const COLUMN_LABELS: Record<AttributeColumn, string> = {
  editor: 'Editor',
  badge: 'Badge',
  log: 'Log',
}

/** Kept in step by hand with `GuideURL.settingsWindow.anchored("attributes")`,
 * which an extension can't reach. */
const HELP_URL = 'https://www.hogbaysoftware.com/bike/guide/using-bike/settings-window#attributes'

// The pane is a fixed 700pt wide, so each of these has to say its piece on one
// line — a wrapped legend line reads as two entries rather than one.
const COLUMN_HELP: Record<AttributeColumn, string> = {
  editor: 'Suggest this attribute in the Attributes Editor, even on rows that don’t have it set.',
  badge: 'Show Bike’s built-in badge. Turn off for attributes that draw their own, or that you’d rather hide.',
  log: 'Record changes in the row’s log. Only rows with a log record anything; add one with row:create-log.',
}

// The column header is the checkbox's only visible label, so each box says the
// whole sentence itself rather than leaving a screen reader with "Editor due".
const COLUMN_ARIA: Record<AttributeColumn, (title: string) => string> = {
  editor: (title) => `Suggest ${title} in the Attributes Editor`,
  badge: (title) => `Show badge for ${title}`,
  log: (title) => `Log changes to ${title}`,
}

/**
 * Every attribute the editor might treat specially, and the three things the
 * user gets to say about each. The rows come from the app context — declared
 * attributes, whatever the open documents actually use, and any name the
 * overrides still hold — so a name inherited from another tool is here to be
 * turned off, not just endured, and a decision made about one stays reachable
 * after the document that carried it closes.
 *
 * A checkbox stores nothing while it agrees with the declaration; see
 * `withCell`. So an attribute whose extension later changes its mind still
 * follows it, and only a disagreement holds still. A disagreement is also the
 * only thing marked in the table, because otherwise a seeded box and a chosen
 * one look alike and neither says which is which.
 */
function AttributesSection({ context }: { context: DOMExtensionContext<AttributesProtocol> }) {
  const [rows, setRows] = useState<AttributeRow[]>([])
  const [overrides, setOverrides] = useState<AttributeOverrides>(() =>
    readOverrides(bike.defaults.get(ATTRIBUTE_OVERRIDES_KEY))
  )
  // Every group starts closed at launch, and the disclosure remembers the rest
  // of the session on its own. Tracked here too, because an unwatched table is
  // one nobody is reading.
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    context.onmessage = (message) => {
      if (message.type === 'attributes') setRows(message.rows)
    }
    // Ask only AFTER onmessage is installed: app→DOM messages are dropped when
    // there's no handler yet (DOM→app ones are queued).
    context.postMessage({ type: 'ready' })
    return () => {
      context.onmessage = undefined
    }
  }, [])

  // Someone else may write these — another window's panel, a script, a hand
  // edit — and a stale checkbox would lie about what the editor is doing.
  useEffect(() => {
    const disposable = bike.defaults.observe(ATTRIBUTE_OVERRIDES_KEY, (value) =>
      setOverrides(readOverrides(value))
    )
    return () => disposable.dispose()
  }, [])

  // Following the open documents costs an observer per document that sees
  // every keystroke, so the app context does it only while this table is
  // genuinely being looked at: this section expanded, in a visible page. The
  // settings web view is built once and kept, so being mounted proves nothing;
  // page visibility is what tracks the window closing and the Extensions tab
  // going away, since either takes the view out of a visible window. If it
  // never reports hidden we simply keep watching — the table stays right, and
  // only the saving is lost.
  useEffect(() => {
    const report = () => context.postMessage({ type: 'watch', active: expanded && !document.hidden })
    report()
    document.addEventListener('visibilitychange', report)
    return () => {
      document.removeEventListener('visibilitychange', report)
      context.postMessage({ type: 'watch', active: false })
    }
  }, [expanded])

  const helpIds = useId()
  const helpId = (column: AttributeColumn) => `${helpIds}-${column}`

  function valueOf(row: AttributeRow, column: AttributeColumn): boolean {
    return overrides[row.name]?.[column] ?? row.seeds[column]
  }

  function onChange(row: AttributeRow, column: AttributeColumn, value: boolean) {
    write(withCell(overrides, row.name, column, value, row.seeds[column]))
  }

  function write(next: AttributeOverrides) {
    setOverrides(next)
    // Nothing left to say means no key at all, rather than an empty object.
    if (Object.keys(next).length === 0) {
      bike.defaults.delete(ATTRIBUTE_OVERRIDES_KEY)
    } else {
      bike.defaults.set(ATTRIBUTE_OVERRIDES_KEY, next)
    }
  }

  return (
    <Disclosure
      label="Attributes"
      accessory={
        <SettingsGroupAccessory
          canReset={Object.keys(overrides).length > 0}
          onReset={() => write({})}
          helpURL={HELP_URL}
          helpTitle="Attributes help"
        />
      }
      accessoryAlignment="trailing"
      // Expanding starts the watching, which catches up on its own — this is
      // belt and braces for a page that never reported itself visible.
      onChange={(next) => {
        setExpanded(next)
        if (next) context.postMessage({ type: 'refresh' })
      }}
    >
      <Label color="secondary" size="small">
        Configure how Bike handles specific attributes:
      </Label>
      <Label color="secondary" size="small">
        {ATTRIBUTE_COLUMNS.map((column, index) => (
          <Fragment key={column}>
            {index > 0 && <br />}
            <span id={helpId(column)}>
              {COLUMN_LABELS[column]} — {COLUMN_HELP[column]}
            </span>
          </Fragment>
        ))}
      </Label>
      {/* `FormRow` is a two-column subgrid, so a real table it is. Fixed
          layout keeps the checkbox columns from shifting as names change
          length. */}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col />
          {ATTRIBUTE_COLUMNS.map((column) => (
            <col key={column} style={{ width: '52px' }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th
              style={headerCell('left')}
              title="Attributes extensions declare, plus any name an open document uses or your settings mention."
            >
              <Label color="secondary" size="small">
                Attribute
              </Label>
            </th>
            {ATTRIBUTE_COLUMNS.map((column) => (
              <th key={column} style={headerCell('center')} title={COLUMN_HELP[column]}>
                <Label color="secondary" size="small">
                  {COLUMN_LABELS[column]}
                </Label>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.name}>
              <td style={bodyCell('left', index === 0)}>
                {/* The raw name, on the text rather than the whole cell: the
                    cell runs the width of the pane, and a tooltip that far
                    from the word it names looks like it belongs to nothing.
                    It's what you type in a filter or the Attributes Editor, it needn't
                    match the title, and it's the only way back to a name the
                    column was too narrow to finish. */}
                <span style={{ color: nameColor(row) }} title={`@${row.name}`}>
                  {row.title}
                </span>
                {!row.declared && (
                  <Label color="tertiary" size="small" style={{ marginLeft: '6px' }}>
                    {row.present ? 'In open document' : 'Not in any open document'}
                  </Label>
                )}
              </td>
              {ATTRIBUTE_COLUMNS.map((column) => {
                const overridden = overrides[row.name]?.[column] !== undefined
                return (
                  <td
                    key={column}
                    style={bodyCell('center', index === 0)}
                    title={overridden ? 'Changed from default' : undefined}
                  >
                    {/* No visible label beside the box — the column header is
                        the label, and only for someone who can see it. */}
                    <span style={{ position: 'relative', display: 'inline-block' }}>
                      <Checkbox
                        checked={valueOf(row, column)}
                        aria-label={
                          COLUMN_ARIA[column](row.title) + (overridden ? ', changed from default' : '')
                        }
                        aria-describedby={helpId(column)}
                        onChange={(e) => onChange(row, column, e.target.checked)}
                      />
                      {overridden && <span aria-hidden="true" style={MODIFIED_DOT} />}
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Disclosure>
  )
}

// Three states worth telling apart, dimmest last: an attribute an extension
// shipped, a name a document brought in, and a name nothing has any more —
// which is here only because a setting still speaks about it.
function nameColor(row: AttributeRow): string | undefined {
  if (row.declared) return undefined
  return row.present ? 'var(--secondary-label)' : 'var(--tertiary-label)'
}

// Small enough to read as a mark on the checkbox rather than a control of its
// own, and clear of the box so it never looks like part of the check.
const MODIFIED_DOT: React.CSSProperties = {
  position: 'absolute',
  top: '-1px',
  right: '-7px',
  width: '5px',
  height: '5px',
  borderRadius: '50%',
  background: 'var(--control-accent)',
}

// The rule under the header needs air on both sides, or the header reads as
// part of the first row rather than as a heading over the whole column. Room
// below it is the header's own padding; room above the first row is that row's,
// since a table's cells are the only thing there is to pad.
function headerCell(align: 'left' | 'center'): React.CSSProperties {
  return {
    textAlign: align,
    fontWeight: 'normal',
    padding: '0 0 6px',
    borderBottom: '0.5px solid var(--separator)',
  }
}

function bodyCell(align: 'left' | 'center', first: boolean): React.CSSProperties {
  return {
    textAlign: align,
    // 3px matches `.bike-form-row`, so rows sit on the same rhythm as the rest
    // of the settings pane.
    paddingTop: first ? '6px' : '3px',
    paddingBottom: '3px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }
}
