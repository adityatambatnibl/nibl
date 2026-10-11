// Application cards: /portal-api/projects  (+ how a card opens its application)
import { request } from "./authService";

export const getProjects = (token) => request("/projects", { token });

/**
 * Open an application.
 *  launch.url          where the application lives (e.g. /oipm/, /npd/sso)
 *  launch.token_param  optional: pass the portal access token in the URL hash
 *                      under this name (NPD uses "oipm_token" for its own SSO)
 */
export function openProject(project, token) {
    const { url, token_param: param } = project.launch || {};
    if (!url) return;
    const hash = param && token ? `#${param}=${encodeURIComponent(token)}` : "";
    window.location.href = `${url}${hash}`;
}
