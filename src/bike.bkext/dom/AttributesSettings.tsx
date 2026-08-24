import { DOMExtensionContext } from 'bike/dom'
import { Checkbox, Disclosure, Label } from 'bike/components'
import { createRoot } from 'react-dom/client'
import { Fragment, useEffect, useState } from 'react'
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
  palette: 'Palette',
  badge: 'Badge',
  log: 'Log',
}

const COLUMN_HELP: Record<AttributeColumn, string> = {
  palette: 'Suggest this attribute in the palette, even when the row doesn’t have it set.',
  badge: 'Show the default badge. Unchecked for custom or unwanted badges.',
  log: 'Record changes to this attribute in the row’s log, if it exists.',
}

/**
 * Every attribute the editor might treat specially, and the three things the
 * user gets to say about each. The rows come from the app context — declared
 * attributes plus whatever the open documents actually use — so a name
 * inherited from another tool is here to be turned off, not just endured.
 *
 * A checkbox stores nothing while it agrees with the declaration; see
 * `withCell`. So an attribute whose extension later changes its mind still
 * follows it, and only a disagreement holds still.
 */
function AttributesSection({ context }: { context: DOMExtensionContext<AttributesProtocol> }) {
  const [rows, setRows] = useState<AttributeRow[]>([])
  const [overrides, setOverrides] = useState<AttributeOverrides>(() =>
    readOverrides(bike.defaults.get(ATTRIBUTE_OVERRIDES_KEY))
  )

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

  function valueOf(row: AttributeRow, column: AttributeColumn): boolean {
    return overrides[row.name]?.[column] ?? row.seeds[column]
  }

  function onChange(row: AttributeRow, column: AttributeColumn, value: boolean) {
    const next = withCell(overrides, row.name, column, value, row.seeds[column])
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
      defaultExpanded
      // Expanding is the moment the list has to be current, and the document
      // scan behind it is worth doing on an explicit action rather than on
      // every edit.
      onChange={(expanded) => expanded && context.postMessage({ type: 'refresh' })}
    >
      <Label color="secondary" size="small">
        Configure how Bike handles specific attributes:
      </Label>
      <Label color="secondary" size="small">
        {ATTRIBUTE_COLUMNS.map((column, index) => (
          <Fragment key={column}>
            {index > 0 && <br />}
            {COLUMN_LABELS[column]} — {COLUMN_HELP[column]}
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
            <th style={headerCell('left')}>
              <Label color="secondary" size="small">
                Attribute
              </Label>
            </th>
            {ATTRIBUTE_COLUMNS.map((column) => (
              <th key={column} style={headerCell('center')}>
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
              <td
                style={bodyCell('left', index === 0)}
                title={row.declared ? undefined : 'Used in an open document'}
              >
                {row.title}
              </td>
              {ATTRIBUTE_COLUMNS.map((column) => (
                <td key={column} style={bodyCell('center', index === 0)}>
                  {/* No visible label beside the box — the column header is
                      the label, and only for someone who can see it. */}
                  <Checkbox
                    checked={valueOf(row, column)}
                    aria-label={`${COLUMN_LABELS[column]} ${row.name}`}
                    onChange={(e) => onChange(row, column, e.target.checked)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Disclosure>
  )
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
