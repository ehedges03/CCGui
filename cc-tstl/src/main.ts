import { Application } from "./Application";
import { Logger } from "./lib/log";
import { WebsocketConnection } from "./services/WebsocketConnection";
import { Threads } from "./system/threads";

const logger = new Logger("main");
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
        Threads.stopScheduler();
    },
    { priority: Threads.Priorities.HIGHEST },
);

ctrlCListenerThread.start();
const wsService = new WebsocketConnection();
const application = new Application(wsService);
const mainThread = Threads.createThread(application, { debugId: "app" });
mainThread.start();

Threads.run();
