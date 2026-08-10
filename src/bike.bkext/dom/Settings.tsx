import { DOMExtensionContext } from 'bike/dom'
import { Disclosure, Label, RadioGroup, type RadioGroupItem } from 'bike/components'
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { ProgressStyle } from './protocols'

// The core extension's settings, one Disclosure per feature. Registered ONCE
// (from app/main.ts) rather than once per feature: `bike.settings.addItem` keys
// its container by label, so separate calls let another extension's section land
// between Bike's own.

export function activate(context: DOMExtensionContext) {
  createRoot(context.element).render(<SettingsPanel />)
}

function SettingsPanel() {
  return (
    <>
      <ProgressSection />
      <DefaultBadgeSection />
    </>
  )
}

const PROGRESS_STYLES: RadioGroupItem<ProgressStyle>[] = [
  { value: 'pie', label: 'Pie chart' },
  { value: 'fraction', label: 'Fraction' },
  { value: 'none', label: 'None' },
]

function ProgressSection() {
  // Anything unrecognized reads as the 'pie' default, so a stale or hand-edited
  // value still leaves exactly one radio selected rather than none.
  const [style, setStyle] = useState<ProgressStyle>(() => {
    const stored = bike.defaults.get('progressStyle')
    return stored === 'fraction' || stored === 'none' ? stored : 'pie'
  })

  function onChange(value: ProgressStyle) {
    setStyle(value)
    bike.defaults.set('progressStyle', value)
  }

  return (
    <Disclosure label="Progress" defaultExpanded>
      <Label color="secondary" size="small">
        How todo checkbox progress is shown:
      </Label>
      <RadioGroup items={PROGRESS_STYLES} value={style} onChange={onChange} />
    </Disclosure>
  )
}

// Settings for the DEFAULT badge — the catch-all that tags every attribute no
// extension presents. The one thing to configure is which attributes it should
// leave alone: files another tool writes into pick up sync ids, hashes and
// other bookkeeping that isn't meant to be read as content.
//
// A free-text list rather than a picked-from list: the names worth hiding come
// from outside Bike, so there's nothing to enumerate, and someone can hide a
// name before ever opening a file that has it.
function DefaultBadgeSection() {
  const [hidden, setHidden] = useState(() => String(bike.defaults.get('hiddenBadgeAttributes') ?? ''))

  function onChange(value: string) {
    setHidden(value)
    bike.defaults.set('hiddenBadgeAttributes', value)
  }

  return (
    <Disclosure label="Default Badge" defaultExpanded>
      <Label color="secondary" size="small">
        Comma separated list of row attribute names that the default badge should skip:
      </Label>
      <textarea
        value={hidden}
        placeholder="row-attribute-name-one, row-attribute-name-two"
        onChange={(e) => onChange(e.target.value)}
        rows={3}
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
