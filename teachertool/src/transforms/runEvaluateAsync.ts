import { logError } from "../services/loggingService";
import { runValidatorPlanAsync } from "../services/makecodeEditorService";
import { stateAndDispatch } from "../state";
import * as Actions from "../state/actions";
import { getCatalogCriteriaWithId } from "../state/helpers";
import { EvaluationStatus, CriteriaInstance } from "../types/criteria";
import { ErrorCode } from "../types/errorCode";
import { makeToast } from "../utils";
import { showToast } from "./showToast";
import { setActiveTab } from "./setActiveTab";
import { setEvalResultOutcome } from "./setEvalResultOutcome";

function generateValidatorPlan(criteriaInstance: CriteriaInstance): pxt.blocks.ValidatorPlan | undefined {
    const { state: teacherTool } = stateAndDispatch();

    const catalogCriteria = getCatalogCriteriaWithId(criteriaInstance.catalogCriteriaId);
    if (!catalogCriteria) {
        logError(ErrorCode.evalMissingCriteria, "Attempting to evaluate criteria with unrecognized catalog id", {
            id: criteriaInstance.catalogCriteriaId,
        });
        return undefined;
    }

    const plan = teacherTool.validatorPlans?.find(plan => plan.name === catalogCriteria.use);
    if (!plan) {
        logError(ErrorCode.evalMissingPlan, "Attempting to evaluate criteria with unrecognized plan", {
            plan: catalogCriteria.use,
        });
        return undefined;
    }

    // TODO: Fill in any parameters. Error if parameters are missing.

    return plan;
}

export async function runEvaluateAsync(fromUserInteraction: boolean) {
    const { state: teacherTool, dispatch } = stateAndDispatch();

    if (fromUserInteraction) {
        setActiveTab("results");
    }

    // EvalRequest promises will resolve to true if evaluation completed successfully (regarless of pass/fail).
    // They will only resolve to false if evaluation was unable to complete.
    const evalRequests = teacherTool.rubric.criteria.map(
        criteriaInstance =>
            new Promise(async resolve => {
                setEvalResultOutcome(criteriaInstance.instanceId, EvaluationStatus.InProgress);

                const loadedValidatorPlans = teacherTool.validatorPlans;
                if (!loadedValidatorPlans) {
                    logError(ErrorCode.validatorPlansNotFound, "Attempting to evaluate criteria without any plans");
                    dispatch(Actions.clearEvalResult(criteriaInstance.instanceId));
                    return resolve(false);
                }

                const plan = generateValidatorPlan(criteriaInstance);

                if (!plan) {
                    dispatch(Actions.clearEvalResult(criteriaInstance.instanceId));
                    return resolve(false);
                }

                const planResult = await runValidatorPlanAsync(plan, loadedValidatorPlans);

                if (planResult) {
                    const result = planResult.result ? EvaluationStatus.Pass : EvaluationStatus.Fail;
                    setEvalResultOutcome(criteriaInstance.instanceId, result);
                    return resolve(true); // evaluation completed successfully, so return true (regardless of pass/fail)
                } else {
                    dispatch(Actions.clearEvalResult(criteriaInstance.instanceId));
                    return resolve(false);
                }
            })
    );

    if (evalRequests.length === 0) {
        return;
    }

    const results = await Promise.all(evalRequests);
    const errorCount = results.filter(r => !r).length;
    if (errorCount === teacherTool.rubric.criteria.length) {
        showToast(makeToast("error", lf("Unable to run evaluation")));
    } else if (errorCount > 0) {
        showToast(makeToast("error", lf("Unable to evaluate some criteria")));
    }
}
