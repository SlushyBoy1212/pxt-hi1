import { CachedWorkspaceProvider, SynchronizationReason } from "./cloudsyncworkspace";

type Header = pxt.workspace.Header;
type ScriptText = pxt.workspace.ScriptText;
type File = pxt.workspace.File;
type WorkspaceProvider = pxt.workspace.WorkspaceProvider;
import U = pxt.Util;

async function unique<T extends {id: string}>(...listFns: (() => Promise<T[]>)[]) {
    const allHdrs = (await Promise.all(listFns.map(ls => ls())))
         .reduce((p, n) => [...p, ...n], [])
    const seenHdrs: { [key: string]: boolean } = {}
    // de-duplicate headers (prefering earlier ones)
    const res = allHdrs.reduce((p, n) => {
         if (seenHdrs[n.id])
             return p;
         seenHdrs[n.id] = true;
         return [...p, n]
     }, [])
     return res;
}

// TODO @darzu: still useful? else cull
export function createJointWorkspace2(primary: WorkspaceProvider, ...others: WorkspaceProvider[]): WorkspaceProvider {
    const all: WorkspaceProvider[] = [primary, ...others];

    // TODO @darzu: debug logging
    console.log(`createJointWorkspace2`);

    async function listAsync(): Promise<Header[]> {
        return unique(...all.map(ws => ws.listAsync))
    }
    async function getAsync(h: Header): Promise<File> {
        // chose the first matching one
        return all.reduce(async (p: Promise<File>, n) => await p ?? n.getAsync(h), null)
    }
    async function getWorkspaceForAsync(h: Header): Promise<WorkspaceProvider> {
        return await all.reduce(
            async (p: Promise<WorkspaceProvider>, n) => await p ?? n.getAsync(h).then(f => f ? n : null), null)
    }
    async function setAsync(h: Header, prevVer: any, text?: ScriptText): Promise<string> {
        const matchingWorkspace = await getWorkspaceForAsync(h)
        const ws = matchingWorkspace ?? primary
        return ws.setAsync(h, prevVer, text)
    }
    async function deleteAsync(h: Header, prevVer: any): Promise<void> {
        const matchingWorkspace = await getWorkspaceForAsync(h)
        return matchingWorkspace?.deleteAsync(h, prevVer)
    }
    async function resetAsync() {
       await Promise.all(all.map(ws => ws.resetAsync()))
    }

    const provider: WorkspaceProvider = {
        getAsync,
        setAsync,
        deleteAsync,
        listAsync,
        resetAsync,
    }
    return provider;
}

// note: these won't work recursively, but as of now there's no forseen use
//  case beyond 1 level. If needed, we could use a hash tree/merkle tree.
function joinHdrsHash(...hashes: string[]): string {
    return hashes?.join("|") ?? ""
}
function splitHdrsHash(hash: string): string[] {
    return hash?.split("|") ?? []
}

export function createJointWorkspace(...all: CachedWorkspaceProvider[]): CachedWorkspaceProvider {
    // TODO @darzu: we're assuming they are disjoint for now

    // TODO @darzu: debug logging
    console.log(`createJointWorkspace`);

    const flattenAndUniqueHdrs = (hs: Header[][]) => U.unique(hs.reduce((p, n) => [...p, ...n], []), h => h.id)

    const firstSync = async () => flattenAndUniqueHdrs(await Promise.all(all.map(w => w.firstSync())))
    const pendingSync = async () => flattenAndUniqueHdrs(await Promise.all(all.map(w => w.pendingSync())))
    // TODO @darzu: is this too expensive?
    const getHeadersHash = () => joinHdrsHash(...all.map(w => w.getHeadersHash()))

    async function synchronize(reason: SynchronizationReason): Promise<Header[]> {
        const expectedHashes = splitHdrsHash(reason.expectedHeadersHash)
        const changes = await Promise.all(all.map((w, i) => w.synchronize({
                ...reason,
                expectedHeadersHash: expectedHashes[i]
            })))
        return flattenAndUniqueHdrs(changes)
    }
    function listSync(): Header[] {
        // return all (assuming disjoint)
        return all.map(w => w.listSync())
            .reduce((p, n) => [...p, ...n], [])
    }
    async function listAsync(): Promise<Header[]> {
        await pendingSync()
        // return all (assuming disjoint)
        return (await Promise.all(all.map(w => w.listAsync())))
            .reduce((p, n) => [...p, ...n], [])
    }
    function getWorkspaceFor(h: Header): CachedWorkspaceProvider {
        return all.reduce((p, n) => p || (n.getHeaderSync(h?.id) ? n : null), null)
    }
    async function getAsync(h: Header): Promise<File> {
        await pendingSync()
        // choose the first matching one
        const ws = getWorkspaceFor(h)
        return ws?.getAsync(h) ?? undefined
    }
    function tryGetSync(h: Header): File {
        // choose the first matching one
        const ws = getWorkspaceFor(h)
        return ws?.tryGetSync(h) ?? undefined
    }
    function getHeaderSync(id: string): Header {
        return all.reduce((p, n) => p || n.getHeaderSync(id), null as Header)
    }
    async function setAsync(h: Header, prevVer: any, text?: ScriptText): Promise<string> {
        await pendingSync()
        // TODO @darzu: dbg logging
        console.log("joint:setAsync")
        console.dir(all.map(w => w.getHeaderSync(h.id)))
        const ws = getWorkspaceFor(h) ?? all[0]
        return ws.setAsync(h, prevVer, text)
    }
    async function deleteAsync(h: Header, prevVer: any): Promise<void> {
        await pendingSync()
        const ws = getWorkspaceFor(h)
        return ws?.deleteAsync(h, prevVer)
    }
    async function resetAsync() {
        await pendingSync()
        await Promise.all(all.map(ws => ws.resetAsync()))
    }

    const provider: CachedWorkspaceProvider = {
        // cache
        getHeadersHash,
        synchronize,
        pendingSync,
        firstSync,
        listSync,
        tryGetSync,
        getHeaderSync,
        // workspace
        getAsync,
        setAsync,
        deleteAsync,
        listAsync,
        resetAsync,
    }
    return provider;
}