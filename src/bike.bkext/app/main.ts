import { AppExtensionContext, AttributeInfo, CommandContext, Disposable, DOMScriptHandle, Window } from 'bike/app'
import { clickHandleCommand, clickLinkCommand, clickFocusCommand } from './commands'
import { registerFeatures } from './features'
import { registerDefaultBadge } from './default-badge'
import {
  ATTRIBUTE_OVERRIDES_KEY,
  AttributeRow,
  AttributesProtocol,
  buildRows,
  readOverrides,
} from '../dom/protocols'

export async function activate(context: AppExtensionContext) {
  registerFeatures()
  // Last, so its `observeAttributes` sees every feature's attribute.
  registerDefaultBadge()

  // One settings item per section; the pane orders sections by label.
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
      // Claims ⌘→ only at the end of the row's text; otherwise falls through.
      'format:.row-attributes-if-text-end': ({ selection }) => {
        if (selection?.type !== 'caret') return false
        if (selection.detail.char !== selection.row.text.count) return false
        // undefined = no handler.
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
      'Command-RightArrow': 'format:.row-attributes-if-text-end',
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
      Space: 'task:toggle-done',
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
    addOrUpdateHomeLocation(window, window.currentOutlineEditor?.outline.root.ensurePersistentId() ?? '')
    window.observeCurrentOutlineEditor((editor) => {
      addOrUpdateHomeLocation(window, editor?.outline.root.ensurePersistentId() ?? '')
    })
  })
}

/** Milliseconds the document scan waits for typing to stop. */
const RESCAN_DELAY = 1000

/** Builds the Attributes settings rows, which need the app context's registry and documents. */
function registerAttributesSettings() {
  const handles = new Set<DOMScriptHandle<AttributesProtocol>>()
  let infos: AttributeInfo[] = []
  let lastSent: string | undefined
  let watching = false
  let watchers: Disposable[] = []
  let rescanTimer: number | undefined

  // Don't await: `addItem` resolves only once Settings is opened.
  bike.settings
    .addItem<AttributesProtocol>({ label: 'Attributes', script: 'AttributesSettings.js' })
    .then((handle) => {
      handle.onmessage = (message) => {
        switch (message.type) {
          case 'watch':
            setWatching(message.active)
            break
          case 'refresh':
            scheduleRescan()
            break
          default:
            // `ready`: a new panel needs rows even if unchanged.
            pushRows(true)
        }
      }
      handles.add(handle)
    })

  bike.observeAttributes((next) => {
    infos = next
    pushRows()
  })

  // The panel tracks override values itself; this catches changes to the row set.
  bike.defaults.observe(ATTRIBUTE_OVERRIDES_KEY, () => pushRows())

  /** Observes every open document's changes, so only while the panel is on screen. */
  function setWatching(active: boolean) {
    if (active === watching) return
    watching = active
    if (active) {
      const disposables: Disposable[] = []
      watchers = disposables
      // Fires for already-open documents too.
      disposables.push(
        bike.observeDocuments((document) => {
          const changes = document.outline.observeChanges(() => scheduleRescan())
          disposables.push(
            changes,
            document.onClose(() => {
              changes.dispose()
              scheduleRescan()
            })
          )
          scheduleRescan()
        })
      )
      pushRows()
    } else {
      for (const disposable of watchers) disposable.dispose()
      watchers = []
      if (rescanTimer !== undefined) {
        clearTimeout(rescanTimer)
        rescanTimer = undefined
      }
    }
  }

  // Trailing debounce: the scan walks every attribute name in every document.
  function scheduleRescan() {
    if (rescanTimer !== undefined) clearTimeout(rescanTimer)
    rescanTimer = setTimeout(() => {
      rescanTimer = undefined
      pushRows()
    }, RESCAN_DELAY)
  }

  function pushRows(force = false) {
    const next = rows()
    // Compare whole rows, not names: `present` can flip on its own.
    const signature = JSON.stringify(next)
    if (!force && signature === lastSent) return
    lastSent = signature
    for (const handle of handles) {
      handle.postMessage({ type: 'attributes', rows: next })
    }
  }

  function rows(): AttributeRow[] {
    const documentNames = new Set<string>()
    for (const document of bike.documents) {
      for (const name of document.outline.attributeNames) documentNames.add(name)
    }
    return buildRows(infos, documentNames, readOverrides(bike.defaults.get(ATTRIBUTE_OVERRIDES_KEY)))
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
