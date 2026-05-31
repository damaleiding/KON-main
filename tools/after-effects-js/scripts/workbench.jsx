#target aftereffects

#include "../lib/common.jsxinc"

(function workbench() {
    app.beginUndoGroup("AE Workbench");

    try {
        var project = aeRequireProject();
        var comp = aeGetActiveComp();

        aeLog("Project: " + (project.file ? project.file.fsName : "Unsaved project"));
        aeLog("Active comp: " + (comp ? comp.name : "None"));

        // Start the current AE task here.
    } catch (err) {
        alert("AE Workbench failed:\n" + err.toString());
    } finally {
        app.endUndoGroup();
    }
}());
