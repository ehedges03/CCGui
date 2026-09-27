import { Application } from "./Application";
import { Logger } from "./lib/log";
import { WebsocketConnection } from "./services/WebsocketConnection";
import { Threads } from "./system/threads";

const logger = new Logger("Main");
const ctrlCListenerThread = Threads.createThread(
    () => {
        let ctrlDown = false;
        let cDown = false;
        logger.info(`looking for c ${keys.c} and ctrl ${keys.leftCtrl}`);

        while (ctrlDown === false || cDown === false) {
            const keyEvent = Threads.pullEvent(["key_up", "key"]);
            if (keyEvent.key === keys.leftCtrl) {
                ctrlDown = !keyEvent.isUp;
            } else if (keyEvent.key === keys.c) {
                cDown = !keyEvent.isUp;
            }
        }
        logger.info("Ctrl+C triggered exiting program...");
        print(debug.traceback());
        Threads.stopScheduler();
    },
    { priority: Threads.Priority.HIGHEST, blocking: false },
);

ctrlCListenerThread.start();

const application = new Application();
const mainThread = Threads.createThread(application, { debugId: "app" });
mainThread.start();

Threads.run();
