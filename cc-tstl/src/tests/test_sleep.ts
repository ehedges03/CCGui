import { log } from "../lib/log";
import { Events } from "../system/event";

const co = coroutine.create(() => {
    os.sleep(0)
})
coroutine.resume(co)
const event = os.pullEventRaw()
log.debug("timer event", "event", event)
log.debug("coroutine status", "status", coroutine.status(co))
coroutine.resume(co, "timer", -1)
log.debug("coroutine status", "status", coroutine.status(co))
coroutine.resume(co, "timer", event[1])
log.debug("coroutine status", "status", coroutine.status(co))
