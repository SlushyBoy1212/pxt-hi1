import * as core from "./core";
import * as data from "./data";
import * as cloud from "./cloud";

/**
 * Virtual API keys
 */
const MODULE = "auth";
const FIELD_USER_PROFILE = "profile";
const FIELD_LOGGED_IN = "logged-in";
export const USER_PROFILE = `${MODULE}:${FIELD_USER_PROFILE}`;
export const LOGGED_IN = `${MODULE}:${FIELD_LOGGED_IN}`;

const USER_PREF_MODULE = "user-pref";
const FIELD_USER_PREFERENCES = "preferences";
const FIELD_HIGHCONTRAST = "high-contrast";
const FIELD_LANGUAGE = "language";
const FIELD_READER = "reader";
export const USER_PREFERENCES = `${USER_PREF_MODULE}:${FIELD_USER_PREFERENCES}`
export const HIGHCONTRAST = `${USER_PREF_MODULE}:${FIELD_HIGHCONTRAST}`
export const LANGUAGE = `${USER_PREF_MODULE}:${FIELD_LANGUAGE}`
export const READER = `${USER_PREF_MODULE}:${FIELD_READER}`
export const HAS_USED_CLOUD = "has-used-cloud"; // Key into local storage to see if this computer has logged in before

export class Component<TProps, TState> extends data.Component<TProps, TState> {
    public getUserProfile(): pxt.auth.UserProfile {
        return this.getData<pxt.auth.UserProfile>(USER_PROFILE);
    }
    public getUserPreferences(): pxt.auth.UserPreferences {
        return this.getData<pxt.auth.UserPreferences>(USER_PREFERENCES);
    }
    public isLoggedIn(): boolean {
        return this.getData<boolean>(LOGGED_IN);
    }
}

class AuthClient extends pxt.auth.AuthClient {
    protected async onSignedIn(): Promise<void> {
        const state = this.getState();
        core.infoNotification(lf("Signed in: {0}", pxt.auth.userName(state.profile)));
        await cloud.syncAsync();
        pxt.storage.setLocal(HAS_USED_CLOUD, "true");
    }
    protected onSignedOut(): Promise<void> {
        core.infoNotification(lf("Signed out"));
        return Promise.resolve();
    }
    protected onSignInFailed(): Promise<void> {
        core.errorNotification(lf("Sign in failed. Something went wrong."));
        return Promise.resolve();
    }
    protected onUserProfileChanged(): Promise<void> {
        const state = this.getState();
        pxt.auth.generateUserProfilePicDataUrl(state.profile);
        data.invalidate("auth:*");
        return Promise.resolve();
    }
    protected onUserPreferencesChanged(diff: ts.pxtc.jsonPatch.PatchOperation[]): Promise<void> {
        for (const op of diff) {
            switch (op.path.join('/')) {
                case "language": data.invalidate(LANGUAGE); break;
                case "highContrast": data.invalidate(HIGHCONTRAST); break;
                case "reader": data.invalidate(READER); break;
            }
        }
        return Promise.resolve();
    }
    protected async onProfileDeleted(userId: string): Promise<void> {
        // Convert cloud-saved projects to local projects.
        await cloud.convertCloudToLocal(userId);
    }
    protected onStateLoaded(): Promise<void> {
        const state = this.getState();
        pxt.auth.generateUserProfilePicDataUrl(state.profile);
        data.invalidate("auth:*");
        data.invalidate("user-pref:*");
        return Promise.resolve();
    }
    protected onApiError(err: any): Promise<void> {
        core.handleNetworkError(err);
        return Promise.resolve();
    }
    protected onStateCleared(): Promise<void> {
        data.invalidate("auth:*");
        //data.invalidate("user-prefs:*"); // Should we invalidate this? Or would it be jarring visually?
        return Promise.resolve();
    }

    public static authApiHandler(p: string): pxt.auth.UserProfile | boolean | string {
        const cli = pxt.auth.client();
        if (cli) {
            const field = data.stripProtocol(p);
            const state = cli.getState();
            switch (field) {
                case FIELD_USER_PROFILE: return { ...state.profile };
                case FIELD_LOGGED_IN: return cli.hasUserId();
            }
        }
        return null;
    }

    public static userPreferencesHandler(path: string): pxt.auth.UserPreferences | boolean | string {
        const cli = pxt.auth.client();
        if (cli) {
            const state = cli.getState();
            if (!state.preferences) {
                cli.initialUserPreferencesAsync().then(() => { });
            }
            return AuthClient.internalUserPreferencesHandler(path);
        }
        return null;
    }

    private static internalUserPreferencesHandler(path: string): pxt.auth.UserPreferences | boolean | string {
        const cli = pxt.auth.client();
        if (cli) {
            const state = cli.getState();
            const field = data.stripProtocol(path);
            switch (field) {
                case FIELD_USER_PREFERENCES: return { ...state.preferences };
                case FIELD_HIGHCONTRAST: return state.preferences?.highContrast ?? pxt.auth.DEFAULT_USER_PREFERENCES().highContrast;
                case FIELD_LANGUAGE: return state.preferences?.language ?? pxt.auth.DEFAULT_USER_PREFERENCES().language;
                case FIELD_READER: return state.preferences?.reader ?? pxt.auth.DEFAULT_USER_PREFERENCES().reader;
            }
            return state.preferences
        }
        return null;
    }
}

export async function initAsync() {
    initVirtualApi();
    const cli = await clientAsync();
    await cli?.authCheckAsync();
}

function initVirtualApi() {
    data.mountVirtualApi(USER_PREF_MODULE, {
        getSync: AuthClient.userPreferencesHandler,
    });
    data.mountVirtualApi(MODULE, {
        getSync: AuthClient.authApiHandler
    });
}

let authClientPromise: Promise<AuthClient>;

async function clientAsync(): Promise<AuthClient | undefined> {
    if (!pxt.auth.hasIdentity()) { return undefined; }
    if (authClientPromise) return authClientPromise;
    authClientPromise = new Promise<AuthClient>(async (resolve, reject) => {
        const cli = new AuthClient();
        await cli.initAsync();
        await cli.authCheckAsync();
        await cli.initialUserPreferencesAsync();
        resolve(cli as AuthClient);
    });
    return authClientPromise;
}

export function hasIdentity(): boolean {
    return pxt.auth.hasIdentity();
}

export function loggedIn(): boolean {
    return data.getData<boolean>(LOGGED_IN);
}

export function userProfile(): pxt.auth.UserProfile {
    return data.getData<pxt.auth.UserProfile>(USER_PROFILE);
}

export function userPreferences(): pxt.auth.UserPreferences {
    return data.getData<pxt.auth.UserPreferences>(USER_PREFERENCES);
}

export async function authCheckAsync(): Promise<pxt.auth.UserProfile | undefined> {
    const cli = await clientAsync();
    return await cli?.authCheckAsync();
}

export async function initialUserPreferencesAsync(): Promise<pxt.auth.UserPreferences | undefined> {
    const cli = await clientAsync();
    return await cli?.initialUserPreferencesAsync();
}

export async function loginAsync(idp: pxt.IdentityProviderId, persistent: boolean, callbackState: pxt.auth.CallbackState = undefined): Promise<void> {
    const cli = await clientAsync();
    await cli?.loginAsync(idp, persistent, callbackState);
}

export async function loginCallbackAsync(qs: pxt.Map<string>): Promise<void> {
    await pxt.auth.loginCallbackAsync(qs);
}

export async function logoutAsync(): Promise<void> {
    const cli = await clientAsync();
    await cli?.logoutAsync("#");
}

export async function deleteProfileAsync(): Promise<void> {
    const cli = await clientAsync();
    await cli?.deleteProfileAsync();
}

export async function patchUserPreferencesAsync(ops: ts.pxtc.jsonPatch.PatchOperation | ts.pxtc.jsonPatch.PatchOperation[]): Promise<void> {
    const cli = await clientAsync();
    await cli?.patchUserPreferencesAsync(ops);
}

export async function setHighContrastPrefAsync(highContrast: boolean): Promise<void> {
    await patchUserPreferencesAsync({
        op: 'replace',
        path: ['highContrast'],
        value: highContrast
    });
}

export async function setLangaugePrefAsync(lang: string): Promise<void> {
    await patchUserPreferencesAsync({
        op: 'replace',
        path: ['language'],
        value: lang
    });
}

export async function setImmersiveReaderPrefAsync(pref: string): Promise<void> {
    await patchUserPreferencesAsync({
        op: 'replace',
        path: ['reader'],
        value: pref
    });
}

export async function apiAsync<T = any>(url: string, data?: any, method?: string): Promise<pxt.auth.ApiResult<T>> {
    const cli = await clientAsync();
    return await cli?.apiAsync(url, data, method);
}
