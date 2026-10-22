/** Facade for D1 context persistence — prefer domain stores for new code. */
export { readContextFile, writeContextFile } from './context-io';
export { loadPlan, savePlan } from './plan-store';
export {
	activeGoalOf,
	loadGoalStore,
	migrateRaceStrategyToActiveGoal,
	saveGoalStore,
	type GoalStore
} from './goal-store';
export {
	loadSettings,
	saveHrMaxSetting,
	saveWeekSetupSetting,
	weekSetupFromSettings,
	type AppSettings
} from './settings-store';
export { loadFuelLog, persistFuelLog, splitFuelSection } from './fuel-store';
export {
	loadActivityHabits,
	loadGear,
	loadWardrobe,
	persistActivityHabits,
	persistGear,
	persistWardrobe,
	rememberGearName
} from './gear-store';
export { clearLiveLocation, loadLiveLocation, saveLiveLocation } from './live-location-store';
export {
	currentPlanWeek,
	loadTrainingContext,
	type TrainingContext
} from './training-context';
