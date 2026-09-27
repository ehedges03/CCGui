import { Application } from "./Application";
import * as log from "./lib/log";
import { Threads } from "./system/threads";

log.setLogLevel(log.LogLevel.DEBUG);

const ctrlCListenerThread = Threads.createThread(
    () => {
        let ctrlDown = false;
        let cDown = false;
        log.info(
            "listening for Ctrl+C",
            "c_key",
            keys.c,
            "ctrl_key",
            keys.leftCtrl,
        );

        while (ctrlDown === false || cDown === false) {
            const keyEvent = Threads.pullEvent(["key_up", "key"]);
            if (keyEvent.key === keys.leftCtrl) {
                ctrlDown = !keyEvent.isUp;
            } else if (keyEvent.key === keys.c) {
                cDown = !keyEvent.isUp;
            }
        }
        log.info("Ctrl+C triggered exiting program...");
        Threads.stopScheduler();
    },
    { priority: Threads.Priority.HIGHEST, blocking: false },
);

ctrlCListenerThread.start();

const application = new Application();
const mainThread = Threads.createThread(application, { debugId: "app" });
mainThread.start();

Threads.run();
