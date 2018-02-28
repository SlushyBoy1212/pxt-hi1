/// <reference path="../localtypings/pxtpackage.d.ts"/>
/// <reference path="../localtypings/pxtparts.d.ts"/>
/// <reference path="../localtypings/pxtarget.d.ts"/>
/// <reference path="util.ts"/>

namespace pxt {

    const lf = U.lf;

    export class Package {
        static getConfigAsync(id: string, fullVers: string): Promise<pxt.PackageConfig> {
            return Promise.resolve().then(() => {
                if (pxt.github.isGithubId(fullVers)) {
                    const repoInfo = pxt.github.parseRepoId(fullVers);
                    return pxt.packagesConfigAsync()
                        .then(config => pxt.github.repoAsync(repoInfo.fullName, config))    // Make sure repo exists and is whitelisted
                        .then(gitRepo => gitRepo ? pxt.github.pkgConfigAsync(repoInfo.fullName, repoInfo.tag) : null);
                } else {
                    // If it's not from GH, assume it's a bundled package
                    // TODO: Add logic for shared packages if we enable that
                    return JSON.parse(pxt.appTarget.bundledpkgs[Package.upgradePackageReference(id, fullVers)][CONFIG_NAME]) as pxt.PackageConfig;
                }
            });
        }

        static corePackages(): pxt.PackageConfig[] {
            const pkgs = pxt.appTarget.bundledpkgs;
            return Object.keys(pkgs).map(id => JSON.parse(pkgs[id][pxt.CONFIG_NAME]) as pxt.PackageConfig)
                .filter(cfg => !!cfg);
        }

        static upgradePackageReference(pkg: string, val: string): string {
            if (val != "*") return pkg;
            const upgrades = appTarget.compile ? appTarget.compile.upgrades : undefined;
            let newPackage = pkg;
            if (upgrades) {
                upgrades.filter(rule => rule.type == "package")
                    .forEach(rule => {
                        for (let match in rule.map) {
                            if (newPackage == match) {
                                newPackage = rule.map[match];
                            }
                        }
                    });
            }
            return newPackage;
        }

        public addedBy: Package[];
        public config: PackageConfig;
        public level = -1;
        public isLoaded = false;
        private resolvedVersion: string;

        constructor(public id: string, public _verspec: string, public parent: MainPackage, addedBy: Package) {
            if (addedBy) {
                this.level = addedBy.level + 1
            }

            this.addedBy = [addedBy];
        }

        version() {
            return this.resolvedVersion || this._verspec;
        }

        verProtocol() {
            let spl = this.version().split(':')
            if (spl.length > 1) return spl[0]
            else return ""
        }

        verArgument() {
            let p = this.verProtocol()
            if (p) return this.version().slice(p.length + 1)
            return this.version()
        }

        commonDownloadAsync(): Promise<Map<string>> {
            let proto = this.verProtocol()
            if (proto == "pub") {
                return Cloud.downloadScriptFilesAsync(this.verArgument())
            } else if (proto == "github") {
                return pxt.packagesConfigAsync()
                    .then(config => pxt.github.downloadPackageAsync(this.verArgument(), config))
                    .then(resp => resp.files)
            } else if (proto == "embed") {
                let resp = pxt.getEmbeddedScript(this.verArgument())
                return Promise.resolve(resp)
            } else
                return Promise.resolve(null as Map<string>)
        }

        host() { return this.parent._host }

        readFile(fn: string) {
            return this.host().readFile(this, fn)
        }

        resolveDep(id: string) {
            if (this.parent.deps.hasOwnProperty(id))
                return this.parent.deps[id];
            return null
        }

        saveConfig() {
            const cfg = JSON.stringify(this.config, null, 4) || "\n"
            this.host().writeFile(this, pxt.CONFIG_NAME, cfg)
        }

        parseJRes(allres: Map<JRes> = {}) {
            for (const f of this.getFiles()) {
                if (U.endsWith(f, ".jres")) {
                    let js: Map<JRes> = JSON.parse(this.readFile(f))
                    let base = js["*"]
                    for (let k of Object.keys(js)) {
                        if (k == "*") continue
                        let v = js[k]
                        if (typeof v == "string") {
                            // short form
                            v = { data: v } as any
                        }
                        let ns = v.namespace || base.namespace || ""
                        if (ns) ns += "."
                        let id = v.id || ns + k
                        let icon = v.icon
                        let mimeType = v.mimeType || base.mimeType
                        let dataEncoding = v.dataEncoding || base.dataEncoding || "base64"
                        if (!icon && dataEncoding == "base64" && (mimeType == "image/png" || mimeType == "image/jpeg")) {
                            icon = "data:" + mimeType + ";base64," + v.data
                        }
                        allres[id] = {
                            id,
                            data: v.data,
                            dataEncoding: v.dataEncoding || base.dataEncoding || "base64",
                            icon,
                            namespace: ns,
                            mimeType
                        }
                    }
                }
            }
            return allres
        }

        private resolveVersionAsync() {
            let v = this._verspec

            if (getEmbeddedScript(this.id)) {
                this.resolvedVersion = v = "embed:" + this.id
            } else if (!v || v == "*") {
                U.userError(lf("version not specified for {0}", this.id))
            }
            return Promise.resolve(v)
        }

        private downloadAsync() {
            let kindCfg = ""
            return this.resolveVersionAsync()
                .then(verNo => {
                    if (!/^embed:/.test(verNo) &&
                        this.config && this.config.installedVersion == verNo)
                        return undefined;
                    pxt.debug('downloading ' + verNo)
                    return this.host().downloadPackageAsync(this)
                        .then(() => {
                            const confStr = this.readFile(pxt.CONFIG_NAME)
                            if (!confStr)
                                U.userError(`package ${this.id} is missing ${pxt.CONFIG_NAME}`)
                            this.parseConfig(confStr);
                            if (this.level != 0)
                                this.config.installedVersion = this.version()
                            this.saveConfig()
                        })
                        .then(() => {
                            pxt.debug(`installed ${this.id} /${verNo}`)
                        })

                })
        }

        protected validateConfig() {
            if (!this.config.dependencies)
                U.userError("Missing dependencies in config of: " + this.id)
            if (!Array.isArray(this.config.files))
                U.userError("Missing files in config of: " + this.id)
            if (typeof this.config.name != "string" || !this.config.name ||
                (this.config.public && !/^[a-z][a-z0-9\-_]+$/i.test(this.config.name)))
                U.userError("Invalid package name: " + this.config.name)
            if (this.config.targetVersions
                && this.config.targetVersions.target
                && semver.strcmp(this.config.targetVersions.target, appTarget.versions.target) > 0)
                U.userError(lf("Package {0} requires target version {1} (you are running {2})",
                    this.config.name, this.config.targetVersions.target, appTarget.versions.target))
        }

        isPackageInUse(pkgId: string, ts: string = this.readFile("main.ts")): boolean {
            // Build the RegExp that will determine whether the dependency is in use. Try to use upgrade rules,
            // otherwise fallback to the package's name
            let regex: RegExp = null;
            const upgrades = appTarget.compile ? appTarget.compile.upgrades : undefined;
            if (upgrades) {
                upgrades.filter(rule => rule.type == "missingPackage").forEach((rule) => {
                    Object.keys(rule.map).forEach((match) => {
                        if (rule.map[match] === pkgId) {
                            regex = new RegExp(match, "g");
                        }
                    });
                });
            }
            if (!regex) {
                regex = new RegExp(pkgId + "\\.", "g");
            }
            return regex.test(ts);
        }

        getMissingPackages(config: pxt.PackageConfig, ts: string): Map<string> {
            const upgrades = appTarget.compile ? appTarget.compile.upgrades : undefined;
            const missing: Map<string> = {};
            if (ts && upgrades)
                upgrades.filter(rule => rule.type == "missingPackage")
                    .forEach(rule => {
                        for (const match in rule.map) {
                            const regex = new RegExp(match, 'g');
                            const pkg = rule.map[match];
                            ts.replace(regex, (m) => {
                                if (!config.dependencies[pkg]) {
                                    missing[pkg] = "*";
                                }
                                return "";
                            })
                        }
                    })
            return missing;
        }

        /**
         * For the given package config or ID, looks through all the currently installed packages to find conflicts in
         * Yotta settings and version spec
         */
        findConflictsAsync(pkgOrId: string | PackageConfig, version: string): Promise<cpp.PkgConflictError[]> {
            let conflicts: cpp.PkgConflictError[] = [];
            let pkgCfg: PackageConfig;
            return Promise.resolve()
                .then(() => {
                    // Get the package config if it's not already provided
                    if (typeof pkgOrId === "string") {
                        return Package.getConfigAsync(pkgOrId, version);
                    } else {
                        return Promise.resolve(pkgOrId as PackageConfig);
                    }
                })
                .then((cfg) => {
                    pkgCfg = cfg;
                    // Iterate through all installed packages and check for conflicting settings
                    if (pkgCfg) {
                        const yottaCfg = pkgCfg.yotta ? U.jsonFlatten(pkgCfg.yotta.config) : null;
                        this.parent.sortedDeps().forEach((depPkg) => {
                            if (pkgCfg.core && depPkg.config.core) {
                                const conflict = new cpp.PkgConflictError(lf("conflict between core packages {0} and {1}", pkgCfg.name, depPkg.id));
                                conflict.pkg0 = depPkg;
                                conflicts.push(conflict);
                                return;
                            }
                            let foundYottaConflict = false;
                            if (yottaCfg) {
                                const depConfig = depPkg.config || JSON.parse(depPkg.readFile(CONFIG_NAME)) as PackageConfig;
                                const hasYottaSettings = !!depConfig && !!depConfig.yotta && !!depPkg.config.yotta.config;
                                if (hasYottaSettings) {
                                    const depYottaCfg = U.jsonFlatten(depConfig.yotta.config);
                                    for (const settingName of Object.keys(yottaCfg)) {
                                        const depSetting = depYottaCfg[settingName];
                                        const isJustDefaults = pkgCfg.yotta.configIsJustDefaults || depConfig.yotta.configIsJustDefaults;
                                        if (depYottaCfg.hasOwnProperty(settingName) && depSetting !== yottaCfg[settingName] && !isJustDefaults && (!depPkg.parent.config.yotta || !depPkg.parent.config.yotta.ignoreConflicts)) {
                                            const conflict = new cpp.PkgConflictError(lf("conflict on yotta setting {0} between packages {1} and {2}", settingName, pkgCfg.name, depPkg.id));
                                            conflict.pkg0 = depPkg;
                                            conflict.settingName = settingName;
                                            conflicts.push(conflict);
                                            foundYottaConflict = true;
                                        }
                                    }
                                }
                            }
                            if (!foundYottaConflict && pkgCfg.name === depPkg.id && depPkg._verspec != version && !/^file:/.test(depPkg._verspec) && !/^file:/.test(version)) {
                                const conflict = new cpp.PkgConflictError(lf("version mismatch for package {0} (installed: {1}, installing: {2})", depPkg, depPkg._verspec, version));
                                conflict.pkg0 = depPkg;
                                conflict.isVersionConflict = true;
                                conflicts.push(conflict);
                            }
                        });
                    }
                    // Also check for conflicts for all the specified package's dependencies (recursively)
                    return Object.keys(pkgCfg.dependencies).reduce((soFar, pkgDep) => {
                        return soFar
                            .then(() => this.findConflictsAsync(pkgDep, pkgCfg.dependencies[pkgDep]))
                            .then((childConflicts) => conflicts.push.apply(conflicts, childConflicts));
                    }, Promise.resolve());
                })
                .then(() => {
                    // For each conflicting package, we need to include their ancestor tree in the list of conflicts
                    // For example, if package A depends on package B, and package B is in conflict with package C,
                    // then package A is also technically in conflict with C
                    const allAncestors = (p: Package): Package[] => {
                        const ancestors: Package[] = [];
                        p.addedBy.forEach((a) => {
                            if (a.id !== this.id) {
                                ancestors.push.apply(allAncestors(a));
                                ancestors.push(a);
                            }
                        });
                        return ancestors;
                    }
                    const additionalConflicts: cpp.PkgConflictError[] = [];
                    conflicts.forEach((c) => {
                        additionalConflicts.push.apply(additionalConflicts, allAncestors(c.pkg0).map((anc) => {
                            const confl = new cpp.PkgConflictError(c.isVersionConflict ?
                                lf("a dependency of {0} has a version mismatch with package {1} (installed: {1}, installing: {2})", anc.id, pkgCfg.name, c.pkg0._verspec, version) :
                                lf("conflict on yotta setting {0} between packages {1} and {2}", c.settingName, pkgCfg.name, c.pkg0.id));
                            confl.pkg0 = anc;
                            return confl;
                        }));
                    });
                    conflicts.push.apply(conflicts, additionalConflicts);

                    // Remove duplicate conflicts (happens if more than one package had the same ancestor)
                    conflicts = conflicts.filter((c, index) => {
                        for (let i = 0; i < index; ++i) {
                            if (c.pkg0.id === conflicts[i].pkg0.id) {
                                return false;
                            }
                        }
                        return true;
                    });

                    return conflicts;
                });
        }

        upgradeAPI(fileContents: string): string {
            const upgrades = appTarget.compile ? appTarget.compile.upgrades : undefined;
            let updatedContents = fileContents;
            if (upgrades) {
                upgrades.filter(rule => rule.type == "api")
                    .forEach(rule => {
                        for (const match in rule.map) {
                            const regex = new RegExp(match, 'g');
                            updatedContents = updatedContents.replace(regex, rule.map[match]);
                        }
                    });
            }
            return updatedContents;
        }

        private parseConfig(cfgSrc: string) {
            const cfg = <PackageConfig>JSON.parse(cfgSrc);
            this.config = cfg;

            const currentConfig = JSON.stringify(this.config);
            for (const dep in this.config.dependencies) {
                const value = Package.upgradePackageReference(dep, this.config.dependencies[dep]);
                if (value != dep) {
                    delete this.config.dependencies[dep];
                    if (value) {
                        this.config.dependencies[value] = "*";
                    }
                }
            }
            if (JSON.stringify(this.config) != currentConfig) {
                this.saveConfig();
            }
            this.validateConfig();
        }

        private patchCorePackage() {
            Util.assert(appTarget.simulator && appTarget.simulator.dynamicBoardDefinition);
            Util.assert(this.level == 0);

            // find all core packages in target
            const corePackages = Object.keys(this.config.dependencies)
                .filter(dep => !!dep && (<pxt.PackageConfig>JSON.parse((pxt.appTarget.bundledpkgs[dep] || {})[pxt.CONFIG_NAME] || "{}").core));
            // no core package? add the first one
            if (corePackages.length == 0) {
                const allCorePkgs = pxt.Package.corePackages();
                if (allCorePkgs.length)
                    this.config.dependencies[allCorePkgs[0].name];
            } else if (corePackages.length > 1) {
                // keep last package
                corePackages.pop();
                corePackages.forEach(dep => {
                    pxt.log(`removing core package ${dep}`)
                    delete this.config.dependencies[dep];
                });
            }
        }

        loadAsync(isInstall = false): Promise<void> {
            if (this.isLoaded) return Promise.resolve();

            let initPromise = Promise.resolve()

            this.isLoaded = true;
            const str = this.readFile(pxt.CONFIG_NAME);
            if (str == null) {
                if (!isInstall)
                    U.userError("Package not installed: " + this.id + ", did you forget to run `pxt install`?")
            } else {
                initPromise = initPromise.then(() => this.parseConfig(str))
            }

            if (isInstall)
                initPromise = initPromise.then(() => this.downloadAsync())

            if (appTarget.simulator && appTarget.simulator.dynamicBoardDefinition) {
                if (this.level == 0)
                    initPromise = initPromise.then(() => this.patchCorePackage());
                initPromise = initPromise.then(() => {
                    if (this.config.files.indexOf("board.json") < 0) return
                    const def = appTarget.simulator.boardDefinition = JSON.parse(this.readFile("board.json")) as pxsim.BoardDefinition;
                    def.id = this.config.name;
                    appTarget.appTheme.boardName = def.boardName || lf("board");
                    appTarget.appTheme.driveDisplayName = def.driveDisplayName || lf("DRIVE");
                    let expandPkg = (v: string) => {
                        let m = /^pkg:\/\/(.*)/.exec(v)
                        if (m) {
                            let fn = m[1]
                            let content = this.readFile(fn)
                            return U.toDataUri(content, U.getMime(fn))
                        } else {
                            return v
                        }
                    }
                    let bd = appTarget.simulator.boardDefinition
                    if (typeof bd.visual == "object") {
                        let vis = bd.visual as pxsim.BoardImageDefinition
                        vis.image = expandPkg(vis.image)
                        vis.outlineImage = expandPkg(vis.outlineImage)
                    }
                })
            }

            const loadDepsRecursive = (dependencies: Map<string>) => {
                return U.mapStringMapAsync(dependencies, (id, ver) => {
                    let mod = this.resolveDep(id)
                    ver = ver || "*"
                    if (mod) {
                        if (mod._verspec != ver && !/^file:/.test(mod._verspec) && !/^file:/.test(ver))
                            U.userError("Version spec mismatch on " + id)
                        mod.level = Math.min(mod.level, this.level + 1)
                        mod.addedBy.push(this)
                        return Promise.resolve()
                    } else {
                        mod = new Package(id, ver, this.parent, this)
                        this.parent.deps[id] = mod
                        return mod.loadAsync(isInstall)
                    }
                })
            }

            return initPromise
                .then(() => loadDepsRecursive(this.config.dependencies))
                .then(() => {
                    if (this.level === 0) {
                        // Check for missing packages. We need to add them 1 by 1 in case they conflict with eachother.
                        const mainTs = this.readFile("main.ts");
                        if (!mainTs) return Promise.resolve(null);

                        const missingPackages = this.getMissingPackages(this.config, mainTs);
                        let didAddPackages = false;
                        let addPackagesPromise = Promise.resolve();
                        Object.keys(missingPackages).reduce((addPackagesPromise, missing) => {
                            return addPackagesPromise
                                .then(() => this.findConflictsAsync(missing, missingPackages[missing]))
                                .then((conflicts) => {
                                    if (conflicts.length) {
                                        const conflictNames = conflicts.map((c) => c.pkg0.id).join(", ");
                                        const settingNames = conflicts.map((c) => c.settingName).filter((s) => !!s).join(", ");
                                        pxt.log(`skipping missing package ${missing} because it conflicts with the following packages: ${conflictNames} (conflicting settings: ${settingNames})`);
                                        return Promise.resolve(null);
                                    } else {
                                        pxt.log(`adding missing package ${missing}`);
                                        didAddPackages = true;
                                        this.config.dependencies[missing] = "*"
                                        const addDependency: Map<string> = {};
                                        addDependency[missing] = missingPackages[missing];
                                        return loadDepsRecursive(addDependency);
                                    }
                                });
                        }, Promise.resolve(null))
                            .then(() => {
                                if (didAddPackages) {
                                    this.saveConfig();
                                    this.validateConfig();
                                }
                                return Promise.resolve(null);
                            });
                    }
                    return Promise.resolve(null);
                })
                .then(() => null);
        }

        getFiles() {
            if (this.level == 0)
                return this.config.files.concat(this.config.testFiles || [])
            else
                return this.config.files.slice(0);
        }

        addSnapshot(files: Map<string>, exts: string[] = [""]) {
            for (let fn of this.getFiles()) {
                if (exts.some(e => U.endsWith(fn, e))) {
                    files[this.id + "/" + fn] = this.readFile(fn)
                }
            }
            files[this.id + "/" + pxt.CONFIG_NAME] = this.readFile(pxt.CONFIG_NAME)
        }

        /**
         * Returns localized strings qName -> translation
         */
        packageLocalizationStringsAsync(lang: string): Promise<Map<string>> {
            const targetId = pxt.appTarget.id;
            const filenames = [this.id + "-jsdoc", this.id];
            const r: Map<string> = {};
            const theme = pxt.appTarget.appTheme || {};

            // live loc of bundled packages
            if (pxt.Util.localizeLive && this.id != "this" && pxt.appTarget.bundledpkgs[this.id]) {
                pxt.log(`loading live translations for ${this.id}`)
                const code = pxt.Util.userLanguage();
                return Promise.all(filenames.map(
                    fn => pxt.Util.downloadLiveTranslationsAsync(code, `${targetId}/${fn}-strings.json`, theme.crowdinBranch)
                        .then(tr => Util.jsonMergeFrom(r, tr))
                        .catch(e => pxt.log(`error while downloading ${targetId}/${fn}-strings.json`)))
                ).then(() => r);
            }
            else {
                const files = this.config.files;
                filenames.map(name => {
                    let fn = `_locales/${lang.toLowerCase()}/${name}-strings.json`;
                    if (files.indexOf(fn) > -1)
                        return JSON.parse(this.readFile(fn)) as Map<string>;
                    if (lang.length > 2) {
                        fn = `_locales/${lang.substring(0, 2).toLowerCase()}/${name}-strings.json`;
                        if (files.indexOf(fn) > -1)
                            return JSON.parse(this.readFile(fn)) as Map<string>;
                    }
                    return undefined;
                }).filter(d => !!d).forEach(d => Util.jsonMergeFrom(r, d));

                return Promise.resolve(r);
            }
        }
    }

    export class MainPackage extends Package {
        public deps: Map<Package> = {};
        private _jres: Map<JRes>;

        constructor(public _host: Host) {
            super("this", "file:.", null, null)
            this.parent = this
            this.addedBy = [this]
            this.level = 0
            this.deps[this.id] = this;
        }

        installAllAsync() {
            return this.loadAsync(true)
        }

        sortedDeps() {
            let visited: Map<boolean> = {}
            let ids: string[] = []
            let rec = (p: Package) => {
                if (!p || U.lookup(visited, p.id)) return;
                visited[p.id] = true
                if (p.config && p.config.dependencies) {
                    const deps = Object.keys(p.config.dependencies);
                    deps.sort((a, b) => U.strcmp(a, b))
                    deps.forEach(id => rec(this.resolveDep(id)))
                    ids.push(p.id)
                }
            }
            rec(this)
            return ids.map(id => this.resolveDep(id))
        }

        localizationStringsAsync(lang: string): Promise<Map<string>> {
            const loc: Map<string> = {};
            return Promise.all(Util.values(this.deps).map(dep =>
                dep.packageLocalizationStringsAsync(lang)
                    .then(depLoc => {
                        if (depLoc) // merge data
                            for (let k in depLoc)
                                if (!loc[k]) loc[k] = depLoc[k];
                    })))
                .then(() => loc);
        }

        getTargetOptions(): CompileTarget {
            let res = U.clone(appTarget.compile)
            U.assert(!!res)
            return res
        }

        getJRes() {
            if (!this._jres) {
                this._jres = {}
                for (const pkg of this.sortedDeps()) {
                    pkg.parseJRes(this._jres)
                }
            }
            return this._jres
        }

        getCompileOptionsAsync(target: CompileTarget = this.getTargetOptions()): Promise<pxtc.CompileOptions> {
            let opts: pxtc.CompileOptions = {
                sourceFiles: [],
                fileSystem: {},
                target: target,
                hexinfo: { hex: [] },
                name: this.config.name
            }

            const generateFile = (fn: string, cont: string) => {
                if (this.config.files.indexOf(fn) < 0)
                    U.userError(lf("please add '{0}' to \"files\" in {1}", fn, pxt.CONFIG_NAME))
                cont = "// Auto-generated. Do not edit.\n" + cont + "\n// Auto-generated. Do not edit. Really.\n"
                if (this.host().readFile(this, fn, true) !== cont) {
                    pxt.debug(`updating ${fn} (size=${cont.length})...`)
                    this.host().writeFile(this, fn, cont, true)
                }
            }

            const upgradeFile = (fn: string, cont: string) => {
                let updatedCont = this.upgradeAPI(cont);
                if (updatedCont != cont) {
                    // save file (force write)
                    pxt.debug(`updating APIs in ${fn} (size=${cont.length})...`)
                    this.host().writeFile(this, fn, updatedCont, true)
                }
                return updatedCont;
            }

            return this.loadAsync()
                .then(() => {
                    pxt.debug(`building: ${this.sortedDeps().map(p => p.config.name).join(", ")}`)
                    let ext = cpp.getExtensionInfo(this)
                    if (ext.shimsDTS) generateFile("shims.d.ts", ext.shimsDTS)
                    if (ext.enumsDTS) generateFile("enums.d.ts", ext.enumsDTS)
                    return (target.isNative
                        ? this.host().getHexInfoAsync(ext)
                        : Promise.resolve<pxtc.HexInfo>(null))
                        .then(inf => {
                            ext = U.flatClone(ext)
                            delete ext.compileData;
                            delete ext.generatedFiles;
                            delete ext.extensionFiles;
                            opts.extinfo = ext
                            opts.hexinfo = inf
                        })
                })
                .then(() => this.config.binaryonly || appTarget.compile.shortPointers || !opts.target.isNative ? null : this.filesToBePublishedAsync(true))
                .then(files => {
                    if (files) {
                        files = U.mapMap(files, upgradeFile);
                        const headerString = JSON.stringify({
                            name: this.config.name,
                            comment: this.config.description,
                            status: "unpublished",
                            scriptId: this.config.installedVersion,
                            cloudId: pxt.CLOUD_ID + appTarget.id,
                            editor: target.preferredEditor ? target.preferredEditor : (U.lookup(files, "main.blocks") ? pxt.BLOCKS_PROJECT_NAME : pxt.JAVASCRIPT_PROJECT_NAME),
                            targetVersions: pxt.appTarget.versions
                        })
                        const programText = JSON.stringify(files)
                        return lzmaCompressAsync(headerString + programText)
                            .then(buf => {
                                opts.embedMeta = JSON.stringify({
                                    compression: "LZMA",
                                    headerSize: headerString.length,
                                    textSize: programText.length,
                                    name: this.config.name,
                                    eURL: pxt.appTarget.appTheme.embedUrl,
                                    eVER: pxt.appTarget.versions ? pxt.appTarget.versions.target : "",
                                    pxtTarget: appTarget.id,
                                })
                                opts.embedBlob = ts.pxtc.encodeBase64(U.uint8ArrayToString(buf))
                            });
                    } else {
                        return Promise.resolve()
                    }
                })
                .then(() => {
                    for (const pkg of this.sortedDeps()) {
                        for (const f of pkg.getFiles()) {
                            if (/\.(ts|asm)$/.test(f)) {
                                let sn = f
                                if (pkg.level > 0)
                                    sn = "pxt_modules/" + pkg.id + "/" + f
                                opts.sourceFiles.push(sn)
                                opts.fileSystem[sn] = pkg.readFile(f)
                            }
                        }
                    }
                    opts.jres = this.getJRes()
                    return opts;
                })
        }

        filesToBePublishedAsync(allowPrivate = false) {
            let files: Map<string> = {};

            return this.loadAsync()
                .then(() => {
                    if (!allowPrivate && !this.config.public)
                        U.userError('Only packages with "public":true can be published')
                    let cfg = U.clone(this.config)
                    delete cfg.installedVersion
                    delete cfg.additionalFilePath
                    U.iterMap(cfg.dependencies, (k, v) => {
                        if (!v || /^file:/.test(v) || /^workspace:/.test(v)) {
                            cfg.dependencies[k] = "*"
                        }
                    })
                    files[pxt.CONFIG_NAME] = JSON.stringify(cfg, null, 4)
                    for (let f of this.getFiles()) {
                        let str = this.readFile(f)
                        if (str == null)
                            U.userError("referenced file missing: " + f)
                        files[f] = str
                    }

                    return U.sortObjectFields(files)
                })
        }

        compressToFileAsync(editor?: string): Promise<Uint8Array> {
            return this.filesToBePublishedAsync(true)
                .then(files => {
                    const project: pxt.cpp.HexFile = {
                        meta: {
                            cloudId: pxt.CLOUD_ID + pxt.appTarget.id,
                            targetVersions: pxt.appTarget.versions,
                            editor: editor || pxt.BLOCKS_PROJECT_NAME,
                            name: this.config.name
                        },
                        source: JSON.stringify(files, null, 2)
                    }
                    return pxt.lzmaCompressAsync(JSON.stringify(project, null, 2));
                });
        }

        computePartDefinitions(parts: string[]): pxt.Map<pxsim.PartDefinition> {
            if (!parts || !parts.length) return {};

            let res: pxt.Map<pxsim.PartDefinition> = {};
            this.sortedDeps().forEach(d => {
                let pjson = d.readFile("pxtparts.json");
                if (pjson) {
                    try {
                        let p = JSON.parse(pjson) as pxt.Map<pxsim.PartDefinition>;
                        for (let k in p) {
                            if (parts.indexOf(k) >= 0) {
                                let part = res[k] = p[k];
                                if (typeof part.visual.image === "string" && /\.svg$/i.test(part.visual.image)) {
                                    let f = d.readFile(part.visual.image);
                                    if (!f) pxt.reportError("parts", "invalid part definition", { "error": `missing visual ${part.visual.image}` })
                                    part.visual.image = `data:image/svg+xml,` + encodeURIComponent(f);
                                }
                            }
                        }
                    } catch (e) {
                        pxt.reportError("parts", "invalid pxtparts.json file");
                    }
                }
            })
            return res;
        }
    }
}