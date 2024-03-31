import { getCollabCanvas } from "../../services/collabCanvas";
import { collabStateAndDispatch } from "../../state/collab";
import * as CollabActions from "../../state/collab/actions";

export function initState(kv: Map<string, string>) {
    const { dispatch } = collabStateAndDispatch();
    dispatch(CollabActions.init(kv));
}
