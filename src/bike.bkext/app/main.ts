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
      // At the row text's end this opens the Attributes Editor; anywhere
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

/** How long the document scan waits for the typing to stop. */
const RESCAN_DELAY = 1000

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
  let lastSent: string | undefined
  let watching = false
  let watchers: Disposable[] = []
  let rescanTimer: number | undefined

  // `addItem` resolves only once the settings web view exists, so attach with
  // `.then` — awaiting it here would stall the rest of activation until
  // someone opens Settings.
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
            // `ready`: a panel that has just mounted needs the rows even when
            // they match what the last one was sent.
            pushRows(true)
        }
      }
      handles.add(handle)
    })

  // Live, never a one-shot snapshot: an extension can register an attribute
  // long after this runs, and a panel already open should grow a row for it.
  bike.observeAttributes((next) => {
    infos = next
    pushRows()
  })

  // The panel tracks the override VALUES itself, so the only thing left for
  // this side to notice is a change to the row SET: a stored name that has no
  // row yet, or an absent row whose last override just went away — including
  // every one of them at once, when Restore Defaults clears the key.
  bike.defaults.observe(ATTRIBUTE_OVERRIDES_KEY, () => pushRows())

  /**
   * Watching costs a change observer per open document, and those see every
   * keystroke — so it is held only while the panel is genuinely on screen, and
   * dropped the moment it isn't. Without it the table is a snapshot, and a name
   * you just typed into a document shows up only if you happen to collapse and
   * reopen the section, which reads as the table being wrong rather than late.
   */
  function setWatching(active: boolean) {
    if (active === watching) return
    watching = active
    if (active) {
      const disposables: Disposable[] = []
      watchers = disposables
      // Fires for documents already open as well as ones opened later, so this
      // one call covers both. Each document's observer leaves with it.
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
      // Whatever happened while we weren't looking.
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

  // Trailing, so a burst of typing scans once after it stops rather than once
  // per keystroke — and the scan is the whole point of the delay: it walks
  // every attribute name in every open document.
  function scheduleRescan() {
    if (rescanTimer !== undefined) clearTimeout(rescanTimer)
    rescanTimer = setTimeout(() => {
      rescanTimer = undefined
      pushRows()
    }, RESCAN_DELAY)
  }

  function pushRows(force = false) {
    const next = rows()
    // Everything the panel draws from, not just the names: `present` flips
    // when the last document using a name closes, and nothing else would say so.
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
