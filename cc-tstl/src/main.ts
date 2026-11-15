import { Application } from "./Application";
import * as log from "./lib/log";
import { Events } from "./system/event";
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
            if (keyEvent instanceof Events.Terminate) {
                log.debug("terminating Ctrl+C watcher thread");
                return;
            }
            if (keyEvent.key === keys.leftCtrl) {
                ctrlDown = !keyEvent.isUp;
            } else if (keyEvent.key === keys.c) {
                cDown = !keyEvent.isUp;
            }
        }
        log.info("Ctrl+C triggered exiting program...");
        Threads.dangerouslyForceStopScheduler();
    },
    {
        priority: Threads.Priority.HIGHEST,
        shutdownRank: Threads.ShutdownRank.WATCH,
    },
);

ctrlCListenerThread.start();

const application = new Application();
const mainThread = Threads.createThread(application, { debugId: "app" });
mainThread.start();

Threads.run();
