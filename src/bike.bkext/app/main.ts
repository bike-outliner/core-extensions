import { AppExtensionContext, AttributeInfo, CommandContext, DOMScriptHandle, Window } from 'bike/app'
import { clickHandleCommand, clickLinkCommand, clickFocusCommand } from './commands'
import { registerFeatures } from './features'
import { registerDefaultBadge } from './default-badge'
import {
  ATTRIBUTE_COLUMNS,
  AttributeRow,
  AttributesProtocol,
  isPolicyEligible,
  seedFor,
} from '../dom/protocols'

export async function activate(context: AppExtensionContext) {
  registerFeatures()
  // Last, so its `observeAttributes` sees every feature's attribute.
  registerDefaultBadge()

  // One settings item per section, so each sorts on its own among every other
  // extension's — the pane orders sections by label, not by the order they're
  // registered. Registered here rather than from each feature so the whole set
  // is visible in one place.
  registerAttributesSettings()
  bike.settings.addItem({ label: 'Tasks', script: 'TasksSettings.js' })

  // Hidden commands for style interactions (not shown in command palette)
  bike.commands.addCommands({
    commands: {
      'bike:.click-handle': clickHandleCommand,
      'bike:.click-focus': clickFocusCommand,
      'bike:.click-link': clickLinkCommand,
      "text:wrap-'": (context) => wrapTextSelection("'", "'", context),
      'text:wrap-[': (context) => wrapTextSelection('[', ']', context),
      'text:wrap-"': (context) => wrapTextSelection('"', '"', context),
      'text:wrap-{': (context) => wrapTextSelection('{', '}', context),
      'text:wrap-(': (context) => wrapTextSelection('(', ')', context),
      // ⌘→'s text-mode binding: only claims the key when the caret is
      // already at the END of the row's text — otherwise returns false and
      // the event falls through to the standard move-to-line-end.
      'format:row-attributes-if-text-end': ({ selection }) => {
        if (selection?.type !== 'caret') return false
        if (selection.detail.char !== selection.row.text.count) return false
        // performCommand is `boolean | undefined` (undefined = no handler).
        return bike.commands.performCommand('format:row-attributes') === true
      },
    },
  })

  bike.keybindings.addKeybindings({
    keymap: 'text-mode',
    keybindings: {
      'Shift-Return': 'row:insert-above',
      'Command-Return': 'row:insert-below',
      'Command-Shift-Return': 'row:insert-child',
      // At the row text's end this opens the attribute palette; anywhere
      // else the handler declines and stock move-to-line-end runs.
      'Command-RightArrow': 'format:row-attributes-if-text-end',
      "'": "text:wrap-'",
      '[': 'text:wrap-[',
      'Shift-"': 'text:wrap-"',
      'Shift-{': 'text:wrap-{',
      'Shift-(': 'text:wrap-(',
    },
  })

  bike.keybindings.addKeybindings({
    keymap: 'block-mode',
    keybindings: {
      Space: 'status:toggle-done',
      'Shift-Return': 'row:insert-above',
      'Command-Return': 'row:insert-below',
      'Command-Shift-Return': 'row:insert-child',
      'Command-RightArrow': 'format:row-attributes',
    },
  })

  function addOrUpdateHomeLocation(window: Window, representedRowId: string) {
    window.sidebar.addLocation({
      id: 'go:home',
      text: 'Home',
      symbol: 'house',
      representedRowId: representedRowId,
      prepareRow: () => window.currentOutlineEditor!.outline.root,
      action: 'go:home',
    })
  }

  bike.observeWindows(async (window: Window) => {
    // hack to make sure home location is added before other locations
    // probably better to add ordering weights to sidebar locations later
    addOrUpdateHomeLocation(window, window.currentOutlineEditor?.outline.root.ensuredPersistentId ?? '')
    window.observeCurrentOutlineEditor((editor) => {
      addOrUpdateHomeLocation(window, editor?.outline.root.ensuredPersistentId ?? '')
    })
  })
}

/**
 * The Attributes settings table's row list, which only the APP context can
 * build: `observeAttributes` lives here, and so do the open documents.
 *
 * Declared names and names a document merely uses are treated alike — the
 * whole point of the table is that an attribute another tool wrote is as much
 * the user's to configure as one an extension shipped.
 */
function registerAttributesSettings() {
  const handles = new Set<DOMScriptHandle<AttributesProtocol>>()
  let infos: AttributeInfo[] = []

  // `addItem` resolves only once the settings web view exists, so attach with
  // `.then` — awaiting it here would stall the rest of activation until
  // someone opens Settings.
  bike.settings
    .addItem<AttributesProtocol>({ label: 'Attributes', script: 'AttributesSettings.js' })
    .then((handle) => {
      handle.onmessage = () => handle.postMessage({ type: 'attributes', rows: rows() })
      handles.add(handle)
    })

  // Live, never a one-shot snapshot: an extension can register an attribute
  // long after this runs, and a panel already open should grow a row for it.
  bike.observeAttributes((next) => {
    infos = next
    for (const handle of handles) {
      handle.postMessage({ type: 'attributes', rows: rows() })
    }
  })

  function rows(): AttributeRow[] {
    const byName = new Map(infos.map((info) => [info.name, info]))
    const names = new Set(byName.keys())
    // A full scan per document, which is why it happens on `ready`/`refresh`
    // and on registration rather than on every edit.
    for (const document of bike.documents) {
      for (const name of document.outline.attributeNames) names.add(name)
    }

    return [...names]
      .filter((name) => isPolicyEligible(name, byName.get(name)?.metadata['user'] as boolean | undefined))
      .sort()
      .map((name) => {
        const info = byName.get(name)
        const seeds = {} as AttributeRow['seeds']
        for (const column of ATTRIBUTE_COLUMNS) {
          seeds[column] = seedFor(column, info?.defaultBadge)
        }
        return {
          name,
          title: info?.title ?? name.charAt(0).toUpperCase() + name.slice(1),
          declared: info != null,
          seeds,
        }
      })
  }
}

function wrapTextSelection(startChar: string, endChar: string, context: CommandContext): boolean {
  const editor = context.editor
  const selection = editor?.selection

  if (!editor || !selection) {
    return false
  }

  if (selection.type === 'text') {
    const detail = selection.detail
    const selectedText = detail.text.string

    if (selectedText.length > 0) {
      editor.transaction({ animate: 'none' }, () => {
        const row = selection.row
        const wrappedText = startChar + selectedText + endChar
        const range = selection.detail.range
        row.text.replace(range, wrappedText)
        editor.selectText(row, range[0] + 1, range[1] + 1)
      })
      return true
    }
  }

  return false
}
