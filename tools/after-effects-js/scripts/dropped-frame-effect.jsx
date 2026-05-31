#target aftereffects

#include "../lib/common.jsxinc"

(function droppedFrameEffect() {
    var SCRIPT_NAME = "Dropped Frame Effect";

    app.beginUndoGroup(SCRIPT_NAME);

    try {
        aeRequireProject();

        var comp = aeGetActiveComp();
        if (!comp) {
            alert("Please open or select a composition first.");
            return;
        }

        var selectedLayers = comp.selectedLayers;
        if (!selectedLayers || selectedLayers.length < 1) {
            alert("Please select one or more video/precomp layers first.");
            return;
        }

        var mode = prompt(
            "Dropped-frame mode:\n" +
            "1 = Keep every N comp frames\n" +
            "2 = Direct target FPS",
            "1"
        );

        if (mode === null) {
            return;
        }

        mode = trimString(mode);

        var targetFps;
        var label;

        if (mode === "2") {
            targetFps = askNumber("Target FPS", Math.max(1, Math.round(comp.frameRate / 2)), 0.01, comp.frameRate);
            if (targetFps === null) {
                return;
            }
            label = formatFps(targetFps) + " fps";
        } else {
            var everyNFrames = askInteger("Keep every N comp frames", 2, 1, 999);
            if (everyNFrames === null) {
                return;
            }
            targetFps = comp.frameRate / everyNFrames;
            label = "every " + everyNFrames + " frames / " + formatFps(targetFps) + " fps";
        }

        var replaceExisting = confirm(
            "Update existing Posterize Time effects if found?\n\n" +
            "OK = update existing effect\n" +
            "Cancel = add a new effect"
        );

        var affectedCount = 0;
        var i;

        for (i = 0; i < selectedLayers.length; i += 1) {
            if (applyPosterizeTime(selectedLayers[i], targetFps, label, replaceExisting)) {
                affectedCount += 1;
            }
        }

        alert("Applied dropped-frame effect to " + affectedCount + " layer(s).\n" + label);
    } catch (err) {
        alert(SCRIPT_NAME + " failed:\n" + err.toString());
    } finally {
        app.endUndoGroup();
    }
}());

function applyPosterizeTime(layer, targetFps, label, replaceExisting) {
    var effects = layer.property("ADBE Effect Parade");

    if (!effects) {
        return false;
    }

    var effect = null;

    if (replaceExisting) {
        effect = findPosterizeTimeEffect(effects);
    }

    if (!effect) {
        effect = effects.addProperty("ADBE Posterize Time");
    }

    effect.name = "Dropped Frame - " + label;

    if (effect.property(1)) {
        effect.property(1).setValue(targetFps);
    } else {
        throw new Error("Could not find Posterize Time frame-rate property.");
    }

    return true;
}

function findPosterizeTimeEffect(effects) {
    var i;
    var effect;

    for (i = 1; i <= effects.numProperties; i += 1) {
        effect = effects.property(i);

        if (effect && effect.matchName === "ADBE Posterize Time") {
            return effect;
        }
    }

    return null;
}

function askInteger(message, defaultValue, minValue, maxValue) {
    var value = prompt(message + "\nRange: " + minValue + " - " + maxValue, String(defaultValue));

    if (value === null) {
        return null;
    }

    value = parseInt(value, 10);
    if (isNaN(value)) {
        throw new Error("Invalid number for: " + message);
    }

    if (value < minValue || value > maxValue) {
        throw new Error(message + " must be between " + minValue + " and " + maxValue + ".");
    }

    return value;
}

function askNumber(message, defaultValue, minValue, maxValue) {
    var value = prompt(message + "\nRange: " + minValue + " - " + maxValue, String(defaultValue));

    if (value === null) {
        return null;
    }

    value = parseFloat(value);
    if (isNaN(value)) {
        throw new Error("Invalid number for: " + message);
    }

    if (value < minValue || value > maxValue) {
        throw new Error(message + " must be between " + minValue + " and " + maxValue + ".");
    }

    return value;
}

function trimString(value) {
    return String(value).replace(/^\s+|\s+$/g, "");
}

function formatFps(value) {
    var rounded = Math.round(value * 1000) / 1000;
    var text = String(rounded);

    if (text.indexOf(".") >= 0) {
        text = text.replace(/0+$/, "").replace(/\.$/, "");
    }

    return text;
}
