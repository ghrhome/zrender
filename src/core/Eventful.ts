// Return true to cancel bubble
export type EventCallback<Ctx, Impl, EvtParam = unknown> = (
    this: CbThis<Ctx, Impl>, eventParam?: EvtParam, ...args: unknown[]
) => boolean | void
export type EventQuery = string | Object

type CbThis<Ctx, Impl> = unknown extends Ctx ? Impl : Ctx;

type EventHandler<Ctx, Impl, EvtParam> = {
    h: EventCallback<Ctx, Impl, EvtParam>
    ctx: CbThis<Ctx, Impl>
    query: EventQuery

    callAtLast: boolean
}

type DefaultEventDefinition = {[eventName: string]: unknown};

export interface EventProcessor<EvtDef = DefaultEventDefinition> {
    normalizeQuery?: (query: EventQuery) => EventQuery
    filter?: (eventType: keyof EvtDef, query: EventQuery) => boolean
    afterTrigger?: (eventType: keyof EvtDef) => void
}

/**
 * Event dispatcher.
 *
 * Event can be defined in EvtDef to enable type check. For example:
 * ```ts
 * interface FooEvents {
 *     // key: event name, value: the first event param in `trigger` and `callback`.
 *     myevent: {
 *        aa: string;
 *        bb: number;
 *     };
 * }
 * class Foo extends Eventful<FooEvents> {
 *     fn() {
 *         // Type check of event name and the first event param is enabled here.
 *         this.trigger('myevent', {aa: 'xx', bb: 3});
 *     }
 * }
 * let foo = new Foo();
 * // Type check of event name and the first event param is enabled here.
 * foo.on('myevent', (eventParam) => { ... });
 * ```
 *
 * @param eventProcessor The object eventProcessor is the scope when
 *        `eventProcessor.xxx` called.
 * @param eventProcessor.normalizeQuery
 *        param: {string|Object} Raw query.
 *        return: {string|Object} Normalized query.
 * @param eventProcessor.filter Event will be dispatched only
 *        if it returns `true`.
 *        param: {string} eventType
 *        param: {string|Object} query
 *        return: {boolean}
 * @param eventProcessor.afterTrigger Called after all handlers called.
 *        param: {string} eventType
 */
export default class Eventful<EvtDef = DefaultEventDefinition> {

    private _$handlers: {[key: string]: EventHandler<any, any, EvtDef[keyof EvtDef]>[]} = {}

    protected _$eventProcessor: EventProcessor<EvtDef>

    constructor(eventProcessors?: EventProcessor<EvtDef>) {
        this._$eventProcessor = eventProcessors || null;
    }

    on<Ctx, EvtNm extends keyof EvtDef>(
        event: EvtNm,
        handler: EventCallback<Ctx, this, EvtDef[EvtNm]>,
        context?: Ctx
    ): this
    on<Ctx, EvtNm extends keyof EvtDef>(
        event: EvtNm,
        query: EventQuery,
        handler: EventCallback<Ctx, this, EvtDef[EvtNm]>,
        context?: Ctx
    ): this
    /**
     * Bind a handler.
     *
     * @param event The event name.
     * @param Condition used on event filter.
     * @param handler The event handler.
     * @param context
     */
    on<Ctx, EvtNm extends keyof EvtDef>(
        event: EvtNm,
        query: EventQuery | EventCallback<Ctx, this, EvtDef[EvtNm]>,
        handler?: EventCallback<Ctx, this, EvtDef[EvtNm]> | Ctx,
        context?: Ctx
    ): this {
        const _h = this._$handlers;

        if (typeof query === 'function') {
            context = handler as Ctx;
            handler = query as EventCallback<Ctx, this, EvtDef[keyof EvtDef]>;
            query = null;
        }

        if (!handler || !event) {
            return this;
        }

        const eventProcessor = this._$eventProcessor;
        if (query != null && eventProcessor && eventProcessor.normalizeQuery) {
            query = eventProcessor.normalizeQuery(query);
        }

        if (!_h[event as string]) {
            _h[event as string] = [];
        }

        for (let i = 0; i < _h[event as string].length; i++) {
            if (_h[event as string][i].h === handler) {
                return this;
            }
        }

        const wrap: EventHandler<Ctx, this, EvtDef[keyof EvtDef]> = {
            h: handler as EventCallback<Ctx, this, EvtDef[keyof EvtDef]>,
            query: query,
            ctx: (context || this) as CbThis<Ctx, this>,
            // FIXME
            // Do not publish this feature util it is proved that it makes sense.
            callAtLast: (handler as any).zrEventfulCallAtLast
        };

        const lastIndex = _h[event as string].length - 1;
        const lastWrap = _h[event as string][lastIndex];
        (lastWrap && lastWrap.callAtLast)
            ? _h[event as string].splice(lastIndex, 0, wrap)
            : _h[event as string].push(wrap);

        return this;
    }

    /**
     * Whether any handler has bound.
     */
    isSilent(eventName: keyof EvtDef): boolean {
        const _h = this._$handlers;
        return !_h[eventName as string] || !_h[eventName as string].length;
    }

    /**
     * Unbind a event.
     *
     * @param eventType The event name.
     *        If no `event` input, "off" all listeners.
     * @param handler The event handler.
     *        If no `handler` input, "off" all listeners of the `event`.
     */
    off(eventType?: keyof EvtDef, handler?: Function): this {
        const _h = this._$handlers;

        if (!eventType) {
            this._$handlers = {};
            return this;
        }

        if (handler) {
            if (_h[eventType as string]) {
                const newList = [];
                for (let i = 0, l = _h[eventType as string].length; i < l; i++) {
                    if (_h[eventType as string][i].h !== handler) {
                        newList.push(_h[eventType as string][i]);
                    }
                }
                _h[eventType as string] = newList;
            }

            if (_h[eventType as string] && _h[eventType as string].length === 0) {
                delete _h[eventType as string];
            }
        }
        else {
            delete _h[eventType as string];
        }

        return this;
    }

    /**
     * Dispatch a event.
     *
     * @param {string} eventType The event name.
     */
    trigger(eventType: keyof EvtDef, eventParam?: EvtDef[keyof EvtDef], ...args: any[]): this;
    trigger(eventType: keyof EvtDef, ...args: any[]): this {
        const _h = this._$handlers[eventType as string];
        const eventProcessor = this._$eventProcessor;

        if (_h) {
            const argLen = args.length;

            const len = _h.length;
            for (let i = 0; i < len; i++) {
                const hItem = _h[i];
                if (eventProcessor
                    && eventProcessor.filter
                    && hItem.query != null
                    && !eventProcessor.filter(eventType, hItem.query)
                ) {
                    i++;
                    continue;
                }

                // Optimize advise from backbone
                switch (argLen) {
                    case 0:
                        hItem.h.call(hItem.ctx);
                        break;
                    case 1:
                        hItem.h.call(hItem.ctx, args[0]);
                        break;
                    case 2:
                        hItem.h.call(hItem.ctx, args[0], args[1]);
                        break;
                    default:
                        // have more than 2 given arguments
                        hItem.h.apply(hItem.ctx, args);
                        break;
                }
            }
        }

        eventProcessor && eventProcessor.afterTrigger
            && eventProcessor.afterTrigger(eventType);

        return this;
    }

    /**
     * Dispatch a event with context, which is specified at the last parameter.
     *
     * @param {string} type The event name.
     */
    triggerWithContext(type: keyof EvtDef) {
        const _h = this._$handlers[type as string];
        const eventProcessor = this._$eventProcessor;

        if (_h) {
            const args: any = arguments;
            const argLen = args.length;
            const ctx = args[argLen - 1];

            const len = _h.length;
            for (let i = 0; i < len;) {
                const hItem = _h[i];
                if (eventProcessor
                    && eventProcessor.filter
                    && hItem.query != null
                    && !eventProcessor.filter(type, hItem.query)
                ) {
                    i++;
                    continue;
                }

                // Optimize advise from backbone
                switch (argLen) {
                    case 0:
                        hItem.h.call(ctx);
                        break;
                    case 1:
                        hItem.h.call(ctx, args[0]);
                        break;
                    case 2:
                        hItem.h.call(ctx, args[0], args[1]);
                        break;
                    default:
                        // have more than 2 given arguments
                        hItem.h.apply(ctx, args.slice(1, argLen - 1));
                        break;
                }
            }
        }

        eventProcessor && eventProcessor.afterTrigger
            && eventProcessor.afterTrigger(type);

        return this;
    }

}