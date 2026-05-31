#target aftereffects

#include "../lib/common.jsxinc"

(function extractFrames() {
    var SCRIPT_NAME = "Extract Frames";

    app.beginUndoGroup(SCRIPT_NAME);

    try {
        var project = aeRequireProject();
        var comp = aeGetActiveComp();

        if (!comp) {
            alert("Please open or select a composition first.");
            return;
        }

        var totalFrames = Math.max(1, Math.floor((comp.duration / comp.frameDuration) + 0.0001));
        var maxFrame = totalFrames - 1;
        var defaultStartFrame = clampFrame(Math.round(comp.workAreaStart / comp.frameDuration), 0, maxFrame);
        var defaultEndFrame = clampFrame(
            Math.floor(((comp.workAreaStart + comp.workAreaDuration) / comp.frameDuration) + 0.0001) - 1,
            defaultStartFrame,
            maxFrame
        );

        var parentFolder = Folder.selectDialog("Choose parent folder for extracted frames");
        if (!parentFolder) {
            return;
        }

        var prefix = prompt("File prefix", sanitizeFileName(comp.name));
        if (prefix === null) {
            return;
        }

        prefix = sanitizeFileName(trimString(prefix));
        if (!prefix) {
            prefix = "ae_frames";
        }

        var startFrame = askInteger("Start frame, relative to comp start", defaultStartFrame, 0, maxFrame);
        if (startFrame === null) {
            return;
        }

        var endFrame = askInteger("End frame, relative to comp start", defaultEndFrame, startFrame, maxFrame);
        if (endFrame === null) {
            return;
        }

        var step = askInteger("Extract every N frames", 1, 1, maxFrame + 1);
        if (step === null) {
            return;
        }

        var templateName = prompt("Output module template", "PNG Sequence");
        if (templateName === null) {
            return;
        }

        templateName = trimString(templateName);
        if (!templateName) {
            templateName = "PNG Sequence";
        }

        var extension = prompt("Output extension", "png");
        if (extension === null) {
            return;
        }

        extension = sanitizeExtension(extension);
        if (!extension) {
            extension = "png";
        }

        var frameCount = Math.floor((endFrame - startFrame) / step) + 1;
        if (frameCount > 500) {
            var continueLargeBatch = confirm("This will add " + frameCount + " render queue items. Continue?");
            if (!continueLargeBatch) {
                return;
            }
        }

        var templateCheck = validateOutputTemplate(comp, templateName);
        if (!templateCheck.ok) {
            alert(
                "Output module template not found or failed: " + templateName +
                "\n\nAvailable templates:\n" + templateCheck.templates
            );
            return;
        }

        var outputFolder = new Folder(parentFolder.fsName + "/" + prefix + "_frames_" + makeTimestamp());
        if (!outputFolder.exists && !outputFolder.create()) {
            throw new Error("Could not create output folder:\n" + outputFolder.fsName);
        }

        var padWidth = String(maxFrame).length;
        if (padWidth < 4) {
            padWidth = 4;
        }

        var createdItems = 0;
        var frameNumber;
        var rqItem;
        var outputModule;
        var outputFile;

        for (frameNumber = startFrame; frameNumber <= endFrame; frameNumber += step) {
            rqItem = project.renderQueue.items.add(comp);
            rqItem.timeSpanStart = frameNumber * comp.frameDuration;
            rqItem.timeSpanDuration = comp.frameDuration;
            rqItem.render = true;

            outputModule = rqItem.outputModule(1);
            outputModule.applyTemplate(templateName);

            outputFile = new File(
                outputFolder.fsName + "/" +
                prefix + "_f" + padNumber(frameNumber, padWidth) + "_[#####]." + extension
            );
            outputModule.file = outputFile;

            createdItems += 1;
        }

        aeLog("Added " + createdItems + " frame extraction items to Render Queue.");
        aeLog("Output folder: " + outputFolder.fsName);

        if (confirm("Added " + createdItems + " items to Render Queue.\n\nRender now?")) {
            project.renderQueue.render();
        } else {
            alert("Frame extraction jobs are ready in Render Queue:\n" + outputFolder.fsName);
        }
    } catch (err) {
        alert(SCRIPT_NAME + " failed:\n" + err.toString());
    } finally {
        app.endUndoGroup();
    }
}());

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

function validateOutputTemplate(comp, templateName) {
    var rqItem = app.project.renderQueue.items.add(comp);
    var outputModule = rqItem.outputModule(1);
    var templates = "";

    try {
        templates = outputModule.templates ? outputModule.templates.join("\n") : "(template list unavailable)";
        outputModule.applyTemplate(templateName);
        return {
            ok: true,
            templates: templates
        };
    } catch (err) {
        return {
            ok: false,
            templates: templates
        };
    } finally {
        rqItem.remove();
    }
}

function clampFrame(value, minValue, maxValue) {
    if (value < minValue) {
        return minValue;
    }

    if (value > maxValue) {
        return maxValue;
    }

    return value;
}

function padNumber(value, width) {
    var text = String(value);

    while (text.length < width) {
        text = "0" + text;
    }

    return text;
}

function sanitizeFileName(value) {
    return String(value).replace(/[\\\/:\*\?"<>\|]/g, "_");
}

function sanitizeExtension(value) {
    return String(value).replace(/^\.+/, "").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function trimString(value) {
    return String(value).replace(/^\s+|\s+$/g, "");
}

function makeTimestamp() {
    var date = new Date();

    return (
        date.getFullYear() +
        padNumber(date.getMonth() + 1, 2) +
        padNumber(date.getDate(), 2) +
        "_" +
        padNumber(date.getHours(), 2) +
        padNumber(date.getMinutes(), 2) +
        padNumber(date.getSeconds(), 2)
    );
}
