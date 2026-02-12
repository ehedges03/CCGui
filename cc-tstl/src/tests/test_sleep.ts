import { Logger } from "../lib/log";
import { Events } from "../system/event";

const logger = new Logger("TestSleep");

const co = coroutine.create(() => {
    os.sleep(0)
})
coroutine.resume(co)
const event = os.pullEventRaw()
logger.debug(textutils.serialiseJSON(event))
logger.debug(coroutine.status(co))
coroutine.resume(co, "timer", -1)
logger.debug(coroutine.status(co))
coroutine.resume(co, "timer", event[1])
logger.debug(coroutine.status(co))