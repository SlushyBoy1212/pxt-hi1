import { classList } from "react-common/components/util";
import css from "./styling/ThreeDotsLoadingDisplay.module.scss";
import { Strings } from "../constants";

export interface ThreeDotsLoadingDisplayProps {
    className?: string;
}
// Three dots that move up and down in a wave pattern.
export const ThreeDotsLoadingDisplay: React.FC<ThreeDotsLoadingDisplayProps> = ({ className }) => {
    return (
        <div className={classList(className, css["loading-ellipsis"])} aria-label={Strings.Loading}>
            <i className={classList("fas fa-circle", css["circle"], css["circle-1"])} aria-hidden={true} />
            <i className={classList("fas fa-circle", css["circle"], css["circle-2"])} aria-hidden={true} />
            <i className={classList("fas fa-circle", css["circle"], css["circle-3"])} aria-hidden={true} />
        </div>
    );
};
