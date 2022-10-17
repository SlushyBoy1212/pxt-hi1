import { useContext } from "react";
import { Modal } from "react-common/components/controls/Modal";
import { SignInModal } from "react-common/components/profile/SignInModal";
import { signInAsync } from "../epics";
import { clearModal } from "../state/actions";
import { AppStateContext, dispatch } from "../state/AppStateContext";

export default function Render() {
    const { state } = useContext(AppStateContext);

    switch(state.modal) {
        case "sign-in":
            return <SignInModal
                onClose={() => dispatch(clearModal())}
                onSignIn={async (provider, rememberMe) => {
                    await signInAsync(provider.id, rememberMe);
                }}
            />
        case "report-abuse":
            return <Modal title={lf("Report Abuse")} onClose={() => dispatch(clearModal())}>
                Report Abuse Placeholder  {/*TODO multiplayer*/}
            </Modal>
        default:
            return <div />
    }
}