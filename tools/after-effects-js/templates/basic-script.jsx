#target aftereffects

#include "../lib/common.jsxinc"

(function runScript() {
    app.beginUndoGroup("Script Name");

    try {
        var project = aeRequireProject();
        var comp = aeGetActiveComp();

        aeLog("Project ready: " + (project ? "yes" : "no"));
        aeLog("Active comp: " + (comp ? comp.name : "None"));

        // Add script logic here.
    } catch (err) {
        alert("Script failed:\n" + err.toString());
    } finally {
        app.endUndoGroup();
    }
}());
