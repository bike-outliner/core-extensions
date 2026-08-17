import { AppExtensionContext, CommandContext, Window } from 'bike/app'
import { clickHandleCommand, clickLinkCommand, clickFocusCommand } from './commands'
import { registerFeatures } from './features'
import { registerDefaultBadge } from './default-badge'

export async function activate(context: AppExtensionContext) {
  registerFeatures()
  // Last, so its `observeAttributes` sees every feature's attribute.
  registerDefaultBadge()

  // One settings item per section, so each sorts on its own among every other
  // extension's — the pane orders sections by label, not by the order they're
  // registered. Registered here rather than from each feature so the whole set
  // is visible in one place.
  bike.settings.addItem({ label: 'Badges', script: 'BadgesSettings.js' })
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
