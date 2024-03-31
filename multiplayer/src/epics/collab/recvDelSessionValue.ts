import { getCollabCanvas } from "../../services/collabCanvas";
import { collabStateAndDispatch } from "../../state/collab";
import * as CollabActions from "../../state/collab/actions";

export function recvDelSessionValue(key: string) {
    const { dispatch } = collabStateAndDispatch();
    dispatch(CollabActions.delSessionValue(key));
    if (key.startsWith("s:")) {
        //getCollabCanvas().removePaintSprite(key);
    }
}
