#target aftereffects

#include "../lib/common.jsxinc"

(function motionTrailEffect() {
    var SCRIPT_NAME = "Motion Trail Effect";

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

        var preset = choosePreset();
        if (!preset) {
            return;
        }

        var i;
        var trailLayer;
        var affectedCount = 0;

        for (i = 0; i < selectedLayers.length; i += 1) {
            trailLayer = createTrailLayer(selectedLayers[i], preset);
            if (trailLayer) {
                affectedCount += 1;
            }
        }

        alert(
            "Motion trail created for " + affectedCount + " layer(s).\n\n" +
            "Preset: " + preset.name + "\n" +
            "Echoes: " + preset.echoCount + "\n" +
            "Echo time: -" + preset.echoStepFrames + " frame(s)\n" +
            "Opacity: " + preset.opacity + "%"
        );
    } catch (err) {
        alert(SCRIPT_NAME + " failed:\n" + err.toString());
    } finally {
        app.endUndoGroup();
    }
}());

function choosePreset() {
    var value = prompt(
        "Motion trail preset:\n" +
        "1 = Soft ghost\n" +
        "2 = Long exposure trail\n" +
        "3 = Stutter trail",
        "2"
    );

    if (value === null) {
        return null;
    }

    value = trimString(value);

    if (value === "1") {
        return {
            name: "Soft ghost",
            echoCount: 6,
            echoStepFrames: 1,
            startIntensity: 0.65,
            decay: 0.62,
            opacity: 45,
            blurRadius: 2,
            blurIterations: 1,
            posterizeFps: 0
        };
    }

    if (value === "3") {
        return {
            name: "Stutter trail",
            echoCount: 8,
            echoStepFrames: 2,
            startIntensity: 0.85,
            decay: 0.72,
            opacity: 70,
            blurRadius: 1,
            blurIterations: 1,
            posterizeFps: 12
        };
    }

    return {
        name: "Long exposure trail",
        echoCount: 14,
        echoStepFrames: 1,
        startIntensity: 0.85,
        decay: 0.78,
        opacity: 60,
        blurRadius: 4,
        blurIterations: 2,
        posterizeFps: 0
    };
}

function createTrailLayer(sourceLayer, preset) {
    var comp = sourceLayer.containingComp;
    var trailLayer = sourceLayer.duplicate();

    trailLayer.name = sourceLayer.name + " - motion trail";
    trailLayer.enabled = true;
    trailLayer.shy = false;

    try {
        trailLayer.moveBefore(sourceLayer);
    } catch (err) {
        // Layer order is a visual preference; continue even if AE refuses to move it.
    }

    setLayerOpacity(trailLayer, preset.opacity);
    setLayerBlendMode(trailLayer);
    applyEcho(trailLayer, comp, preset);
    applyBlur(trailLayer, preset);
    applyPosterizeTime(trailLayer, preset);

    return trailLayer;
}

function applyEcho(layer, comp, preset) {
    var effects = layer.property("ADBE Effect Parade");
    var echo = effects.addProperty("ADBE Echo");

    echo.name = "Long Exposure Echo";

    setEffectValue(echo, 1, -preset.echoStepFrames * comp.frameDuration);
    setEffectValue(echo, 2, preset.echoCount);
    setEffectValue(echo, 3, preset.startIntensity);
    setEffectValue(echo, 4, preset.decay);

    // Echo Operator popup order in AE: Add, Maximum, Minimum, Screen, Composite In Back,
    // Composite In Front, Blend. Screen keeps bright trails without making the layer opaque.
    try {
        setEffectValue(echo, 5, 4);
    } catch (err) {
        aeLog("Could not set Echo Operator; AE kept its default operator.");
    }
}

function applyBlur(layer, preset) {
    if (preset.blurRadius <= 0) {
        return;
    }

    try {
        var blur = layer.property("ADBE Effect Parade").addProperty("ADBE Box Blur2");

        blur.name = "Trail Softness";
        setEffectValue(blur, 1, preset.blurRadius);
        setEffectValue(blur, 2, preset.blurIterations);
        setEffectValue(blur, 3, true);
    } catch (err) {
        aeLog("Could not add Fast Box Blur: " + err.toString());
    }
}

function applyPosterizeTime(layer, preset) {
    if (!preset.posterizeFps || preset.posterizeFps <= 0) {
        return;
    }

    try {
        var posterize = layer.property("ADBE Effect Parade").addProperty("ADBE Posterize Time");

        posterize.name = "Trail Stutter";
        setEffectValue(posterize, 1, preset.posterizeFps);
    } catch (err) {
        aeLog("Could not add Posterize Time: " + err.toString());
    }
}

function setEffectValue(effect, propertyIndex, value) {
    var property = effect.property(propertyIndex);

    if (!property) {
        throw new Error("Missing effect property index " + propertyIndex + " on " + effect.name + ".");
    }

    property.setValue(value);
}

function setLayerOpacity(layer, opacity) {
    var opacityProperty = layer.property("ADBE Transform Group").property("ADBE Opacity");

    if (opacityProperty) {
        opacityProperty.setValue(opacity);
    }
}

function setLayerBlendMode(layer) {
    try {
        layer.blendingMode = BlendingMode.SCREEN;
    } catch (err) {
        try {
            layer.blendingMode = BlendingMode.ADD;
        } catch (ignored) {
            aeLog("Could not set blend mode; AE kept the layer's current mode.");
        }
    }
}

function trimString(value) {
    return String(value).replace(/^\s+|\s+$/g, "");
}
