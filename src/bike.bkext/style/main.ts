import { defineEditorStyle } from 'bike/style'
import { registerBaseLayer } from './layer-base'
import { registerFormattingLayers } from './layer-formatting'
import { registerControlsLayer } from './layer-controls'
import { registerInteractionLayers } from './layer-interaction'
import { registerFocusLayers } from './layer-focus'

let style = defineEditorStyle('bike', 'Bike (default)')

registerBaseLayer(style)
registerFormattingLayers(style)
registerControlsLayer(style)
registerInteractionLayers(style)
registerFocusLayers(style)
