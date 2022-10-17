import { useContext } from "react";
import { AppStateContext } from "../state/AppStateContext";
import { Button } from "../../../react-common/components/controls/Button";
import { signOutAsync } from "../epics";
import JoinOrHost from "./JoinOrHost";
import HostGame from "./HostGame";
import JoinGame from "./JoinGame";

export default function Render() {
    const { state } = useContext(AppStateContext);
    const { appMode } = state;
    const { uiMode } = appMode;

    const authButtonLabel = lf("Sign Out");

    return (
        <div className="tw-pt-3 tw-pb-8 tw-flex tw-flex-col tw-items-center tw-gap-1 tw-h-screen">
            <Button
                className="primary"
                label={authButtonLabel}
                title={authButtonLabel}
                onClick={signOutAsync}
            />
            {uiMode === "home" && <JoinOrHost />}
            {uiMode === "host" && <HostGame />}
            {uiMode === "join" && <JoinGame />}
        </div>
    );
}
