// How each application's card LOOKS. Which cards exist, where they open and
// who may open them come from the portal backend
// (shared/configuration/projects.json + each application's own approval).
//
// A new application needs NO change here: it gets the default look.
// Add an entry only to give it its own colour.
export const PROJECT_THEMES = {
    oipm: { className: "oipm-card" },
    npd: { className: "npd-card" },
    "ai-drawing-control": { className: "npd-card drawing-card" },
};

export const DEFAULT_THEME = { className: "npd-card generic-card" };

export const themeFor = (projectId) => PROJECT_THEMES[projectId] || DEFAULT_THEME;
