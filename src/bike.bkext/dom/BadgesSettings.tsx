import { DOMExtensionContext } from 'bike/dom'
import { Disclosure, Label } from 'bike/components'
import { createRoot } from 'react-dom/client'
import { useState } from 'react'

// One `settings.addItem` per section, each in its own file — see TasksSettings.

export function activate(context: DOMExtensionContext) {
  createRoot(context.element).render(<BadgesSection />)
}

// Settings for the DEFAULT badge — the catch-all that tags every attribute no
// extension presents. The one thing to configure is which attributes it should
// leave alone: files another tool writes into pick up sync ids, hashes and
// other bookkeeping that isn't meant to be read as content.
//
// A free-text list rather than a picked-from list: the names worth hiding come
// from outside Bike, so there's nothing to enumerate, and someone can hide a
// name before ever opening a file that has it.
function BadgesSection() {
  const [hidden, setHidden] = useState(() => String(bike.defaults.get('hiddenBadgeAttributes') ?? ''))

  function onChange(value: string) {
    setHidden(value)
    bike.defaults.set('hiddenBadgeAttributes', value)
  }

  return (
    <Disclosure label="Badges" defaultExpanded>
      <Label color="secondary" size="small">
        Attributes that shouldn't get an automatic badge, separated by commas:
      </Label>
      <textarea
        value={hidden}
        placeholder="row-attribute-name-one, row-attribute-name-two"
        onChange={(e) => onChange(e.target.value)}
        rows={1}
        style={{
          display: 'block',
          boxSizing: 'border-box',
          width: 'auto',
          minWidth: 0,
          marginRight: '4px',
          resize: 'none',
        }}
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="off"
      />
    </Disclosure>
  )
}
