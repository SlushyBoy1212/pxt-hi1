namespace pxtblockly {
    export class FieldKind extends Blockly.FieldDropdown {
        constructor(private opts: pxtc.KindInfo) {
            super(createMenuGenerator(opts));
        }

        initView() {
            super.initView();
        }

        onItemSelected_(menu: Blockly.Menu, menuItem: Blockly.MenuItem) {
            const value = menuItem.getValue();
            if (value === "CREATE") {
                promptAndCreateKind(this.sourceBlock_.workspace, this.opts, lf("New {0}:", this.opts.memberName),
                    newName => newName && this.setValue(newName));
            }
            else if (value === "RENAME") {
                const ws = this.sourceBlock_.workspace;
                const toRename = ws.getVariable(this.value_, kindType(this.opts.name))
                const oldName = toRename.name;

                if (this.opts.initialMembers.indexOf(oldName) !== -1) {
                    Blockly.alert(lf("The built-in {0} '{1}' cannot be renamed. Try creating a new kind instead!", this.opts.memberName, oldName));
                    return;
                }

                promptAndRenameKind(
                    ws,
                    { ...this.opts, toRename },
                    lf("Rename '{0}':", oldName),
                    newName => {
                        // Update the values of all existing field instances
                        const allFields = getAllFields(ws, field => field instanceof FieldKind
                            && field.getValue() === oldName
                            && field.opts.name === this.opts.name);
                        for (const field of allFields) {
                            field.ref.setValue(newName);
                        }
                    }
                );
            }
            else if (value === "DELETE") {
                const ws = this.sourceBlock_.workspace;
                const toDelete = ws.getVariable(this.value_, kindType(this.opts.name));
                const varName = toDelete.name;

                if (this.opts.initialMembers.indexOf(varName) !== -1) {
                    Blockly.alert(lf("The built-in {0} '{1}' cannot be deleted.", this.opts.memberName, varName));
                    return;
                }

                const uses = getAllFields(ws, field => field instanceof FieldKind
                    && field.getValue() === varName
                    && field.opts.name === this.opts.name);

                if (uses.length > 1) {
                    Blockly.confirm(lf("Delete {0} uses of the \"{1}\" {2}?", uses.length, varName, this.opts.memberName), response => {
                        if (!response) return;
                        Blockly.Events.setGroup(true);
                        for (const use of uses) {
                            use.block.dispose(true);
                        }
                        ws.deleteVariableById(toDelete.getId());
                        this.setValue(this.opts.initialMembers[0]);
                        Blockly.Events.setGroup(false);
                    });
                }
                else {
                    ws.deleteVariableById(toDelete.getId());
                    this.setValue(this.opts.initialMembers[0]);
                }
            }
            else {
                super.onItemSelected_(menu, menuItem);
            }
        }

        doClassValidation_(value: any) {
            // update cached option list when adding a new kind
            if (this.opts?.initialMembers && !this.opts.initialMembers.find(el => el == value)) this.getOptions();
            return super.doClassValidation_(value);
        }

        getOptions(opt_useCache?: boolean) {
            this.initVariables();
            return super.getOptions(opt_useCache);
        }

        private initVariables() {
            if (this.sourceBlock_ && this.sourceBlock_.workspace) {
                const ws = this.sourceBlock_.workspace;
                const existing = getExistingKindMembers(ws, this.opts.name);
                this.opts.initialMembers.forEach(memberName => {
                    if (existing.indexOf(memberName) === -1) {
                        createVariableForKind(ws, this.opts, memberName);
                    }
                });

                if (this.getValue() === "CREATE" || this.getValue() === "RENAME" || this.getValue() === "DELETE") {
                    if (this.opts.initialMembers.length) {
                        this.setValue(this.opts.initialMembers[0]);
                    }
                }
            }
        }
    }

    function createMenuGenerator(opts: pxtc.KindInfo): () => string[][] {
        return function () {
            const res: string[][] = [];

            const that = this as FieldKind;
            if (that.sourceBlock_ && that.sourceBlock_.workspace && !that.sourceBlock_.isInFlyout) {
                const options = that.sourceBlock_.workspace.getVariablesOfType(kindType(opts.name));
                options.forEach(model => {
                    res.push([model.name, model.name]);
                });
            } else {
                // Can't create variables from within the flyout, so we just have to fake it
                opts.initialMembers.forEach((e) => res.push([e, e]) );
            }


            res.push([lf("Add a new {0}...", opts.memberName), "CREATE"]);
            res.push([undefined, "SEPARATOR"]);
            res.push([lf("Rename {0}...", opts.memberName), "RENAME"]);
            res.push([lf("Delete {0}...", opts.memberName), "DELETE"]);

            return res;
        }
    }

    type PromptFunction<U extends pxtc.KindInfo> = (ws: Blockly.Workspace, opts: U, message: string, cb: (newValue: string) => void) => void;

    function promptForName<U extends pxtc.KindInfo>(ws: Blockly.Workspace, opts: U, message: string, cb: (newValue: string) => void, prompt: PromptFunction<U>) {
        Blockly.prompt(message, null, response => {
            if (response) {
                let nameIsValid = false;
                if (pxtc.isIdentifierStart(response.charCodeAt(0), 2)) {
                    nameIsValid = true;
                    for (let i = 1; i < response.length; i++) {
                        if (!pxtc.isIdentifierPart(response.charCodeAt(i), 2)) {
                            nameIsValid = false;
                        }
                    }
                }

                if (!nameIsValid) {
                    Blockly.alert(lf("Names must start with a letter and can only contain letters, numbers, '$', and '_'."),
                        () => promptForName(ws, opts, message, cb, prompt));
                    return;
                }

                if (pxt.blocks.isReservedWord(response) || response === "CREATE" || response === "RENAME" || response === "DELETE") {
                    Blockly.alert(lf("'{0}' is a reserved word and cannot be used.", response),
                        () => promptForName(ws, opts, message, cb, prompt));
                    return;
                }

                const existing = getExistingKindMembers(ws, opts.name);
                for (let i = 0; i < existing.length; i++) {
                    const name = existing[i];
                    if (name === response) {
                        Blockly.alert(lf("A {0} named '{1}' already exists.", opts.memberName, response),
                            () => promptForName(ws, opts, message, cb, prompt));
                        return;
                    }
                }

                if (response === opts.createFunctionName) {
                    Blockly.alert(lf("'{0}' is a reserved name.", opts.createFunctionName),
                        () => promptForName(ws, opts, message, cb, prompt));
                }

                cb(response);
            }
        }, { placeholder: opts.promptHint });
    }

    function promptAndCreateKind(ws: Blockly.Workspace, opts: pxtc.KindInfo, message: string, cb: (newValue: string) => void) {
        const responseHandler = (response: string) => {
            cb(createVariableForKind(ws, opts, response));
        };

        promptForName(ws, opts, message, responseHandler, promptAndCreateKind);
    }

    interface RenameOptions extends pxtc.KindInfo {
        toRename: Blockly.VariableModel;
    }

    function promptAndRenameKind(ws: Blockly.Workspace, opts: RenameOptions, message: string, cb: (newValue: string) => void) {
        const responseHandler = (response: string) => {
            ws.getVariableMap().renameVariable(opts.toRename, response);
            cb(response);
        };

        promptForName(ws, opts, message, responseHandler, promptAndRenameKind);
    }


    function getExistingKindMembers(ws: Blockly.Workspace, kindName: string): string[] {
        const existing = ws.getVariablesOfType(kindType(kindName));
        if (existing && existing.length) {
            return existing.map(m => m.name);
        }
        else {
            return [];
        }
    }

    function createVariableForKind(ws: Blockly.Workspace, opts: pxtc.KindInfo, newName: string): string {
        Blockly.Variables.getOrCreateVariablePackage(ws, null, newName, kindType(opts.name));
        return newName;
    }

    function kindType(name: string) {
        return "KIND_" + name;
    }
}