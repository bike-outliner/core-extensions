import { DOMExtensionContext } from 'bike/dom'
import { Checkbox, Disclosure } from 'bike/components'
import { createRoot } from 'react-dom/client'
import { useState } from 'react'

export function activate(context: DOMExtensionContext) {
  createRoot(context.element).render(<SettingsPanel />)
}

function SettingsPanel() {
  const [pie, setPie] = useState(() => bike.defaults.get('progressStyle') !== 'fraction')

  function onChange(checked: boolean) {
    setPie(checked)
    bike.defaults.set('progressStyle', checked ? 'pie' : 'fraction')
  }

  return (
    <Disclosure label="Progress" defaultExpanded>
      <Checkbox checked={pie} onChange={(e) => onChange(e.target.checked)}>
        Show progress as a pie chart
      </Checkbox>
    </Disclosure>
  )
}
