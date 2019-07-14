(function () {
	'use strict';

	function noop() {}

	function assign(tar, src) {
		for (var k in src) tar[k] = src[k];
		return tar;
	}

	function assignTrue(tar, src) {
		for (var k in src) tar[k] = 1;
		return tar;
	}

	function append(target, node) {
		target.appendChild(node);
	}

	function insert(target, node, anchor) {
		target.insertBefore(node, anchor);
	}

	function detachNode(node) {
		node.parentNode.removeChild(node);
	}

	function destroyEach(iterations, detach) {
		for (var i = 0; i < iterations.length; i += 1) {
			if (iterations[i]) iterations[i].d(detach);
		}
	}

	function createElement(name) {
		return document.createElement(name);
	}

	function createSvgElement(name) {
		return document.createElementNS('http://www.w3.org/2000/svg', name);
	}

	function createText(data) {
		return document.createTextNode(data);
	}

	function createComment() {
		return document.createComment('');
	}

	function setAttribute(node, attribute, value) {
		if (value == null) node.removeAttribute(attribute);
		else node.setAttribute(attribute, value);
	}

	function setData(text, data) {
		text.data = '' + data;
	}

	function setStyle(node, key, value) {
		node.style.setProperty(key, value);
	}

	function addResizeListener(element, fn) {
		if (getComputedStyle(element).position === 'static') {
			element.style.position = 'relative';
		}

		const object = document.createElement('object');
		object.setAttribute('style', 'display: block; position: absolute; top: 0; left: 0; height: 100%; width: 100%; overflow: hidden; pointer-events: none; z-index: -1;');
		object.type = 'text/html';

		let win;

		object.onload = () => {
			win = object.contentDocument.defaultView;
			win.addEventListener('resize', fn);
		};

		if (/Trident/.test(navigator.userAgent)) {
			element.appendChild(object);
			object.data = 'about:blank';
		} else {
			object.data = 'about:blank';
			element.appendChild(object);
		}

		return {
			cancel: () => {
				win && win.removeEventListener && win.removeEventListener('resize', fn);
				element.removeChild(object);
			}
		};
	}

	function blankObject() {
		return Object.create(null);
	}

	function destroy(detach) {
		this.destroy = noop;
		this.fire('destroy');
		this.set = noop;

		this._fragment.d(detach !== false);
		this._fragment = null;
		this._state = {};
	}

	function _differs(a, b) {
		return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
	}

	function _differsImmutable(a, b) {
		return a != a ? b == b : a !== b;
	}

	function fire(eventName, data) {
		var handlers =
			eventName in this._handlers && this._handlers[eventName].slice();
		if (!handlers) return;

		for (var i = 0; i < handlers.length; i += 1) {
			var handler = handlers[i];

			if (!handler.__calling) {
				try {
					handler.__calling = true;
					handler.call(this, data);
				} finally {
					handler.__calling = false;
				}
			}
		}
	}

	function flush(component) {
		component._lock = true;
		callAll(component._beforecreate);
		callAll(component._oncreate);
		callAll(component._aftercreate);
		component._lock = false;
	}

	function get() {
		return this._state;
	}

	function init(component, options) {
		component._handlers = blankObject();
		component._slots = blankObject();
		component._bind = options._bind;
		component._staged = {};

		component.options = options;
		component.root = options.root || component;
		component.store = options.store || component.root.store;

		if (!options.root) {
			component._beforecreate = [];
			component._oncreate = [];
			component._aftercreate = [];
		}
	}

	function on(eventName, handler) {
		var handlers = this._handlers[eventName] || (this._handlers[eventName] = []);
		handlers.push(handler);

		return {
			cancel: function() {
				var index = handlers.indexOf(handler);
				if (~index) handlers.splice(index, 1);
			}
		};
	}

	function set(newState) {
		this._set(assign({}, newState));
		if (this.root._lock) return;
		flush(this.root);
	}

	function _set(newState) {
		var oldState = this._state,
			changed = {},
			dirty = false;

		newState = assign(this._staged, newState);
		this._staged = {};

		for (var key in newState) {
			if (this._differs(newState[key], oldState[key])) changed[key] = dirty = true;
		}
		if (!dirty) return;

		this._state = assign(assign({}, oldState), newState);
		this._recompute(changed, this._state);
		if (this._bind) this._bind(changed, this._state);

		if (this._fragment) {
			this.fire("state", { changed: changed, current: this._state, previous: oldState });
			this._fragment.p(changed, this._state);
			this.fire("update", { changed: changed, current: this._state, previous: oldState });
		}
	}

	function _stage(newState) {
		assign(this._staged, newState);
	}

	function callAll(fns) {
		while (fns && fns.length) fns.shift()();
	}

	function _mount(target, anchor) {
		this._fragment[this._fragment.i ? 'i' : 'm'](target, anchor || null);
	}

	function removeFromStore() {
		this.store._remove(this);
	}

	var proto = {
		destroy,
		get,
		fire,
		on,
		set,
		_recompute: noop,
		_set,
		_stage,
		_mount,
		_differs
	};

	function Store(state, options) {
		this._handlers = {};
		this._dependents = [];

		this._computed = blankObject();
		this._sortedComputedProperties = [];

		this._state = assign({}, state);
		this._differs = options && options.immutable ? _differsImmutable : _differs;
	}

	assign(Store.prototype, {
		_add(component, props) {
			this._dependents.push({
				component: component,
				props: props
			});
		},

		_init(props) {
			const state = {};
			for (let i = 0; i < props.length; i += 1) {
				const prop = props[i];
				state['$' + prop] = this._state[prop];
			}
			return state;
		},

		_remove(component) {
			let i = this._dependents.length;
			while (i--) {
				if (this._dependents[i].component === component) {
					this._dependents.splice(i, 1);
					return;
				}
			}
		},

		_set(newState, changed) {
			const previous = this._state;
			this._state = assign(assign({}, previous), newState);

			for (let i = 0; i < this._sortedComputedProperties.length; i += 1) {
				this._sortedComputedProperties[i].update(this._state, changed);
			}

			this.fire('state', {
				changed,
				previous,
				current: this._state
			});

			this._dependents
				.filter(dependent => {
					const componentState = {};
					let dirty = false;

					for (let j = 0; j < dependent.props.length; j += 1) {
						const prop = dependent.props[j];
						if (prop in changed) {
							componentState['$' + prop] = this._state[prop];
							dirty = true;
						}
					}

					if (dirty) {
						dependent.component._stage(componentState);
						return true;
					}
				})
				.forEach(dependent => {
					dependent.component.set({});
				});

			this.fire('update', {
				changed,
				previous,
				current: this._state
			});
		},

		_sortComputedProperties() {
			const computed = this._computed;
			const sorted = this._sortedComputedProperties = [];
			const visited = blankObject();
			let currentKey;

			function visit(key) {
				const c = computed[key];

				if (c) {
					c.deps.forEach(dep => {
						if (dep === currentKey) {
							throw new Error(`Cyclical dependency detected between ${dep} <-> ${key}`);
						}

						visit(dep);
					});

					if (!visited[key]) {
						visited[key] = true;
						sorted.push(c);
					}
				}
			}

			for (const key in this._computed) {
				visit(currentKey = key);
			}
		},

		compute(key, deps, fn) {
			let value;

			const c = {
				deps,
				update: (state, changed, dirty) => {
					const values = deps.map(dep => {
						if (dep in changed) dirty = true;
						return state[dep];
					});

					if (dirty) {
						const newValue = fn.apply(null, values);
						if (this._differs(newValue, value)) {
							value = newValue;
							changed[key] = true;
							state[key] = value;
						}
					}
				}
			};

			this._computed[key] = c;
			this._sortComputedProperties();

			const state = assign({}, this._state);
			const changed = {};
			c.update(state, changed, true);
			this._set(state, changed);
		},

		fire,

		get,

		on,

		set(newState) {
			const oldState = this._state;
			const changed = this._changed = {};
			let dirty = false;

			for (const key in newState) {
				if (this._computed[key]) throw new Error(`'${key}' is a read-only computed property`);
				if (this._differs(newState[key], oldState[key])) changed[key] = dirty = true;
			}
			if (!dirty) return;

			this._set(newState, changed);
		}
	});

	/* node_modules/layercake/src/LayerCakeContainer.html generated by Svelte v2.16.1 */

	function add_css() {
		var style = createElement("style");
		style.id = 'svelte-1f8skbk-style';
		style.textContent = ".layercake-chart-container,.layercake-chart-container *{box-sizing:border-box}.svelte-ref-chartContainer.svelte-1f8skbk{width:100%;height:100%}";
		append(document.head, style);
	}

	function get_each_context(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.layout = list[i];
		child_ctx.i = i;
		return child_ctx;
	}

	function create_main_fragment(component, ctx) {
		var div, div_resize_listener;

		var each_value = ctx.$layouts;

		var each_blocks = [];

		for (var i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block(component, get_each_context(ctx, each_value, i));
		}

		function div_resize_handler() {
			component.store.set({ containerWidth: div.clientWidth, containerHeight: div.clientHeight });
		}

		return {
			c() {
				div = createElement("div");

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}
				component.root._aftercreate.push(div_resize_handler);
				div.className = "layercake-chart-container svelte-1f8skbk svelte-ref-chartContainer";
			},

			m(target, anchor) {
				insert(target, div, anchor);

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].m(div, null);
				}

				div_resize_listener = addResizeListener(div, div_resize_handler);
				component.refs.chartContainer = div;
			},

			p(changed, ctx) {
				if (changed.$layouts) {
					each_value = ctx.$layouts;

					for (var i = 0; i < each_value.length; i += 1) {
						const child_ctx = get_each_context(ctx, each_value, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
						} else {
							each_blocks[i] = create_each_block(component, child_ctx);
							each_blocks[i].c();
							each_blocks[i].m(div, null);
						}
					}

					for (; i < each_blocks.length; i += 1) {
						each_blocks[i].d(1);
					}
					each_blocks.length = each_value.length;
				}
			},

			d(detach) {
				if (detach) {
					detachNode(div);
				}

				destroyEach(each_blocks, detach);

				div_resize_listener.cancel();
				if (component.refs.chartContainer === div) component.refs.chartContainer = null;
			}
		};
	}

	// (2:1) {#each $layouts as layout, i}
	function create_each_block(component, ctx) {
		var switch_instance_anchor;

		var switch_value = ctx.layout.type;

		function switch_props(ctx) {
			var switch_instance_initial_data = {
			 	layoutI: ctx.i,
			 	layers: ctx.layout.layers,
			 	opts: ctx.layout.opts || {}
			 };
			return {
				root: component.root,
				store: component.store,
				data: switch_instance_initial_data
			};
		}

		if (switch_value) {
			var switch_instance = new switch_value(switch_props(ctx));
		}

		return {
			c() {
				if (switch_instance) switch_instance._fragment.c();
				switch_instance_anchor = createComment();
			},

			m(target, anchor) {
				if (switch_instance) {
					switch_instance._mount(target, anchor);
				}

				insert(target, switch_instance_anchor, anchor);
			},

			p(changed, ctx) {
				var switch_instance_changes = {};
				if (changed.$layouts) switch_instance_changes.layers = ctx.layout.layers;
				if (changed.$layouts) switch_instance_changes.opts = ctx.layout.opts || {};

				if (switch_value !== (switch_value = ctx.layout.type)) {
					if (switch_instance) {
						switch_instance.destroy();
					}

					if (switch_value) {
						switch_instance = new switch_value(switch_props(ctx));
						switch_instance._fragment.c();
						switch_instance._mount(switch_instance_anchor.parentNode, switch_instance_anchor);
					} else {
						switch_instance = null;
					}
				}

				else if (switch_value) {
					switch_instance._set(switch_instance_changes);
				}
			},

			d(detach) {
				if (detach) {
					detachNode(switch_instance_anchor);
				}

				if (switch_instance) switch_instance.destroy(detach);
			}
		};
	}

	function LayerCakeContainer(options) {
		init(this, options);
		this.refs = {};
		this._state = assign(this.store._init(["containerWidth","containerHeight","layouts"]), options.data);
		this.store._add(this, ["containerWidth","containerHeight","layouts"]);
		this._intro = true;

		this._handlers.destroy = [removeFromStore];

		if (!document.getElementById("svelte-1f8skbk-style")) add_css();

		this._fragment = create_main_fragment(this, this._state);

		if (options.target) {
			this._fragment.c();
			this._mount(options.target, options.anchor);

			flush(this);
		}
	}

	assign(LayerCakeContainer.prototype, proto);

	/* node_modules/layercake/src/layouts/Svg.html generated by Svelte v2.16.1 */

	function add_css$1() {
		var style = createElement("style");
		style.id = 'svelte-18jpo51-style';
		style.textContent = ".svelte-ref-svgLayout.svelte-18jpo51{position:absolute;top:0;left:0}";
		append(document.head, style);
	}

	function get_each_context$1(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.layer = list[i];
		return child_ctx;
	}

	function create_main_fragment$1(component, ctx) {
		var svg, g, g_transform_value, svg_width_value, svg_height_value, svg_style_value;

		var if_block = (ctx.opts.defs) && create_if_block(component, ctx);

		var each_value = ctx.layers;

		var each_blocks = [];

		for (var i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block$1(component, get_each_context$1(ctx, each_value, i));
		}

		return {
			c() {
				svg = createSvgElement("svg");
				if (if_block) if_block.c();
				g = createSvgElement("g");

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}
				setAttribute(g, "transform", g_transform_value = "translate(" + ctx.$padding.left + ", " + ctx.$padding.top + ")");
				setAttribute(svg, "data-layout-index", ctx.layoutI);
				setAttribute(svg, "data-layout", "Svg");
				setAttribute(svg, "width", svg_width_value = ctx.$width + ctx.$padding.left + ctx.$padding.right);
				setAttribute(svg, "height", svg_height_value = ctx.$height + ctx.$padding.bottom + ctx.$padding.top);
				setAttribute(svg, "style", svg_style_value = ctx.opts.zIndex ? `z-index:${ctx.opts.zIndex};` : '');
				setAttribute(svg, "class", "svelte-18jpo51 svelte-ref-svgLayout");
			},

			m(target, anchor) {
				insert(target, svg, anchor);
				if (if_block) if_block.m(svg, null);
				append(svg, g);

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].m(g, null);
				}

				component.refs.svgLayout = svg;
			},

			p(changed, ctx) {
				if (ctx.opts.defs) {
					if (if_block) {
						if_block.p(changed, ctx);
					} else {
						if_block = create_if_block(component, ctx);
						if_block.c();
						if_block.m(svg, g);
					}
				} else if (if_block) {
					if_block.d(1);
					if_block = null;
				}

				if (changed.layers) {
					each_value = ctx.layers;

					for (var i = 0; i < each_value.length; i += 1) {
						const child_ctx = get_each_context$1(ctx, each_value, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
						} else {
							each_blocks[i] = create_each_block$1(component, child_ctx);
							each_blocks[i].c();
							each_blocks[i].m(g, null);
						}
					}

					for (; i < each_blocks.length; i += 1) {
						each_blocks[i].d(1);
					}
					each_blocks.length = each_value.length;
				}

				if ((changed.$padding) && g_transform_value !== (g_transform_value = "translate(" + ctx.$padding.left + ", " + ctx.$padding.top + ")")) {
					setAttribute(g, "transform", g_transform_value);
				}

				if (changed.layoutI) {
					setAttribute(svg, "data-layout-index", ctx.layoutI);
				}

				if ((changed.$width || changed.$padding) && svg_width_value !== (svg_width_value = ctx.$width + ctx.$padding.left + ctx.$padding.right)) {
					setAttribute(svg, "width", svg_width_value);
				}

				if ((changed.$height || changed.$padding) && svg_height_value !== (svg_height_value = ctx.$height + ctx.$padding.bottom + ctx.$padding.top)) {
					setAttribute(svg, "height", svg_height_value);
				}

				if ((changed.opts) && svg_style_value !== (svg_style_value = ctx.opts.zIndex ? `z-index:${ctx.opts.zIndex};` : '')) {
					setAttribute(svg, "style", svg_style_value);
				}
			},

			d(detach) {
				if (detach) {
					detachNode(svg);
				}

				if (if_block) if_block.d();

				destroyEach(each_blocks, detach);

				if (component.refs.svgLayout === svg) component.refs.svgLayout = null;
			}
		};
	}

	// (2:1) {#if opts.defs}
	function create_if_block(component, ctx) {
		var switch_instance_anchor;

		var switch_value = ctx.opts.defs;

		function switch_props(ctx) {
			var switch_instance_initial_data = { opts: ctx.opts.opts || {} };
			return {
				root: component.root,
				store: component.store,
				data: switch_instance_initial_data
			};
		}

		if (switch_value) {
			var switch_instance = new switch_value(switch_props(ctx));
		}

		return {
			c() {
				if (switch_instance) switch_instance._fragment.c();
				switch_instance_anchor = createComment();
			},

			m(target, anchor) {
				if (switch_instance) {
					switch_instance._mount(target, anchor);
				}

				insert(target, switch_instance_anchor, anchor);
			},

			p(changed, ctx) {
				var switch_instance_changes = {};
				if (changed.opts) switch_instance_changes.opts = ctx.opts.opts || {};

				if (switch_value !== (switch_value = ctx.opts.defs)) {
					if (switch_instance) {
						switch_instance.destroy();
					}

					if (switch_value) {
						switch_instance = new switch_value(switch_props(ctx));
						switch_instance._fragment.c();
						switch_instance._mount(switch_instance_anchor.parentNode, switch_instance_anchor);
					} else {
						switch_instance = null;
					}
				}

				else if (switch_value) {
					switch_instance._set(switch_instance_changes);
				}
			},

			d(detach) {
				if (detach) {
					detachNode(switch_instance_anchor);
				}

				if (switch_instance) switch_instance.destroy(detach);
			}
		};
	}

	// (6:2) {#each layers as layer}
	function create_each_block$1(component, ctx) {
		var g;

		var switch_value = ctx.layer.component;

		function switch_props(ctx) {
			var switch_instance_initial_data = { opts: ctx.layer.opts || {} };
			return {
				root: component.root,
				store: component.store,
				data: switch_instance_initial_data
			};
		}

		if (switch_value) {
			var switch_instance = new switch_value(switch_props(ctx));
		}

		return {
			c() {
				g = createSvgElement("g");
				if (switch_instance) switch_instance._fragment.c();
			},

			m(target, anchor) {
				insert(target, g, anchor);

				if (switch_instance) {
					switch_instance._mount(g, null);
				}
			},

			p(changed, ctx) {
				var switch_instance_changes = {};
				if (changed.layers) switch_instance_changes.opts = ctx.layer.opts || {};

				if (switch_value !== (switch_value = ctx.layer.component)) {
					if (switch_instance) {
						switch_instance.destroy();
					}

					if (switch_value) {
						switch_instance = new switch_value(switch_props(ctx));
						switch_instance._fragment.c();
						switch_instance._mount(g, null);
					} else {
						switch_instance = null;
					}
				}

				else if (switch_value) {
					switch_instance._set(switch_instance_changes);
				}
			},

			d(detach) {
				if (detach) {
					detachNode(g);
				}

				if (switch_instance) switch_instance.destroy();
			}
		};
	}

	function Svg(options) {
		init(this, options);
		this.refs = {};
		this._state = assign(this.store._init(["width","padding","height"]), options.data);
		this.store._add(this, ["width","padding","height"]);
		this._intro = true;

		this._handlers.destroy = [removeFromStore];

		if (!document.getElementById("svelte-18jpo51-style")) add_css$1();

		this._fragment = create_main_fragment$1(this, this._state);

		if (options.target) {
			this._fragment.c();
			this._mount(options.target, options.anchor);

			flush(this);
		}
	}

	assign(Svg.prototype, proto);

	/* node_modules/layercake/src/layouts/Html.html generated by Svelte v2.16.1 */

	function add_css$2() {
		var style = createElement("style");
		style.id = 'svelte-19vf4ct-style';
		style.textContent = ".svelte-ref-htmlLayout.svelte-19vf4ct,.svelte-ref-htmlLayer.svelte-19vf4ct{position:absolute;top:0;right:0;bottom:0;left:0}";
		append(document.head, style);
	}

	function get_each_context$2(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.layer = list[i];
		return child_ctx;
	}

	function create_main_fragment$2(component, ctx) {
		var div;

		var each_value = ctx.layers;

		var each_blocks = [];

		for (var i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block$2(component, get_each_context$2(ctx, each_value, i));
		}

		return {
			c() {
				div = createElement("div");

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}
				div.dataset.layoutIndex = ctx.layoutI;
				div.dataset.layoutType = "Html";
				setStyle(div, "top", "" + ctx.$padding.top + "px");
				setStyle(div, "right", "" + ctx.$padding.right + "px");
				setStyle(div, "bottom", "" + ctx.$padding.bottom + "px");
				setStyle(div, "left", "" + ctx.$padding.left + "px" + (ctx.opts.zIndex ? `z-index:${ctx.opts.zIndex};` : ''));
				div.className = "svelte-19vf4ct svelte-ref-htmlLayout";
			},

			m(target, anchor) {
				insert(target, div, anchor);

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].m(div, null);
				}

				component.refs.htmlLayout = div;
			},

			p(changed, ctx) {
				if (changed.layers) {
					each_value = ctx.layers;

					for (var i = 0; i < each_value.length; i += 1) {
						const child_ctx = get_each_context$2(ctx, each_value, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
						} else {
							each_blocks[i] = create_each_block$2(component, child_ctx);
							each_blocks[i].c();
							each_blocks[i].m(div, null);
						}
					}

					for (; i < each_blocks.length; i += 1) {
						each_blocks[i].d(1);
					}
					each_blocks.length = each_value.length;
				}

				if (changed.layoutI) {
					div.dataset.layoutIndex = ctx.layoutI;
				}

				if (changed.$padding) {
					setStyle(div, "top", "" + ctx.$padding.top + "px");
					setStyle(div, "right", "" + ctx.$padding.right + "px");
					setStyle(div, "bottom", "" + ctx.$padding.bottom + "px");
				}

				if (changed.$padding || changed.opts) {
					setStyle(div, "left", "" + ctx.$padding.left + "px" + (ctx.opts.zIndex ? `z-index:${ctx.opts.zIndex};` : ''));
				}
			},

			d(detach) {
				if (detach) {
					detachNode(div);
				}

				destroyEach(each_blocks, detach);

				if (component.refs.htmlLayout === div) component.refs.htmlLayout = null;
			}
		};
	}

	// (2:1) {#each layers as layer}
	function create_each_block$2(component, ctx) {
		var div, text;

		var switch_value = ctx.layer.component;

		function switch_props(ctx) {
			var switch_instance_initial_data = { opts: ctx.layer.opts || {} };
			return {
				root: component.root,
				store: component.store,
				data: switch_instance_initial_data
			};
		}

		if (switch_value) {
			var switch_instance = new switch_value(switch_props(ctx));
		}

		return {
			c() {
				div = createElement("div");
				if (switch_instance) switch_instance._fragment.c();
				text = createText("\n\t\t");
				div.className = "svelte-19vf4ct svelte-ref-htmlLayer";
			},

			m(target, anchor) {
				insert(target, div, anchor);

				if (switch_instance) {
					switch_instance._mount(div, null);
				}

				append(div, text);
				component.refs.htmlLayer = div;
			},

			p(changed, ctx) {
				var switch_instance_changes = {};
				if (changed.layers) switch_instance_changes.opts = ctx.layer.opts || {};

				if (switch_value !== (switch_value = ctx.layer.component)) {
					if (switch_instance) {
						switch_instance.destroy();
					}

					if (switch_value) {
						switch_instance = new switch_value(switch_props(ctx));
						switch_instance._fragment.c();
						switch_instance._mount(div, text);
					} else {
						switch_instance = null;
					}
				}

				else if (switch_value) {
					switch_instance._set(switch_instance_changes);
				}
			},

			d(detach) {
				if (detach) {
					detachNode(div);
				}

				if (switch_instance) switch_instance.destroy();
				if (component.refs.htmlLayer === div) component.refs.htmlLayer = null;
			}
		};
	}

	function Html(options) {
		init(this, options);
		this.refs = {};
		this._state = assign(this.store._init(["padding"]), options.data);
		this.store._add(this, ["padding"]);
		this._intro = true;

		this._handlers.destroy = [removeFromStore];

		if (!document.getElementById("svelte-19vf4ct-style")) add_css$2();

		this._fragment = create_main_fragment$2(this, this._state);

		if (options.target) {
			this._fragment.c();
			this._mount(options.target, options.anchor);

			flush(this);
		}
	}

	assign(Html.prototype, proto);

	/* --------------------------------------------
	 *
	 * Similar to underscore's _.omit, return a copy
	 * of the object without the blacklisted keys
	 *
	 * --------------------------------------------
	 */
	function omit (obj = {}, keys = []) {
		const newObj = {};
		Object.keys(obj).forEach(key => {
			if (!keys.includes(key)) {
				newObj[key] = obj[key];
			}
		});
		return newObj;
	}

	/* node_modules/layercake/src/layouts/Canvas.html generated by Svelte v2.16.1 */

	function oncreate() {
		const { layers, opts } = this.get();
		const canvas = this.refs.canvasLayout;
		const ctx = canvas.getContext('2d', omit(opts, ['zIndex']));
		const components = layers.map(layer => {
			const Component = layer.component;
			const comp = new Component({
				data: {canvas, ctx, opts: layer.opts},
				store: this.store,
				target: canvas,
				cakeRoot: this.root // TODO, document why we're setting cakeRoot
			});
			return comp;
		});
		this.store.on('update', () => {
			components.forEach(comp => {
				comp.set({canvas, ctx});
			});
		});
	}
	function add_css$3() {
		var style = createElement("style");
		style.id = 'svelte-4pif3n-style';
		style.textContent = ".svelte-ref-canvasLayout.svelte-4pif3n{position:absolute}";
		append(document.head, style);
	}

	function create_main_fragment$3(component, ctx) {
		var canvas;

		return {
			c() {
				canvas = createElement("canvas");
				canvas.dataset.layoutIndex = ctx.layoutI;
				canvas.dataset.layoutType = "Canvas";
				setStyle(canvas, "top", "" + ctx.$padding.top + "px");
				setStyle(canvas, "left", "" + ctx.$padding.left + "px");
				setStyle(canvas, "width", "" + ctx.$width + "px");
				setStyle(canvas, "height", "" + ctx.$height + "px" + (ctx.opts.zIndex ? `z-index:${ctx.opts.zIndex};` : ''));
				canvas.className = "svelte-4pif3n svelte-ref-canvasLayout";
			},

			m(target, anchor) {
				insert(target, canvas, anchor);
				component.refs.canvasLayout = canvas;
			},

			p(changed, ctx) {
				if (changed.layoutI) {
					canvas.dataset.layoutIndex = ctx.layoutI;
				}

				if (changed.$padding) {
					setStyle(canvas, "top", "" + ctx.$padding.top + "px");
					setStyle(canvas, "left", "" + ctx.$padding.left + "px");
				}

				if (changed.$width) {
					setStyle(canvas, "width", "" + ctx.$width + "px");
				}

				if (changed.$height || changed.opts) {
					setStyle(canvas, "height", "" + ctx.$height + "px" + (ctx.opts.zIndex ? `z-index:${ctx.opts.zIndex};` : ''));
				}
			},

			d(detach) {
				if (detach) {
					detachNode(canvas);
				}

				if (component.refs.canvasLayout === canvas) component.refs.canvasLayout = null;
			}
		};
	}

	function Canvas(options) {
		init(this, options);
		this.refs = {};
		this._state = assign(this.store._init(["padding","width","height"]), options.data);
		this.store._add(this, ["padding","width","height"]);
		this._intro = true;

		this._handlers.destroy = [removeFromStore];

		if (!document.getElementById("svelte-4pif3n-style")) add_css$3();

		this._fragment = create_main_fragment$3(this, this._state);

		this.root._oncreate.push(() => {
			oncreate.call(this);
			this.fire("update", { changed: assignTrue({}, this._state), current: this._state });
		});

		if (options.target) {
			this._fragment.c();
			this._mount(options.target, options.anchor);

			flush(this);
		}
	}

	assign(Canvas.prototype, proto);

	/* node_modules/layercake/src/layouts/Webgl.html generated by Svelte v2.16.1 */

	function oncreate$1() {
		const { layers, opts } = this.get();
		const canvas = this.refs.webglLayout;
		let testGl;
		let webglCtx;

		const contextOptions = omit(opts, ['zIndex']);

		// Try to find a working webgl context
		const contexts = ['webgl', 'experimental-webgl', 'moz-webgl', 'webkit-3d'];
		for (var j = 0; j < contexts.length; j++) {
			testGl = canvas.getContext(contexts[j], contextOptions);
			if (testGl) {
				webglCtx = testGl;
				break;
			}
		}
		const gl = webglCtx || null;

		const components = layers.map(layer => {
			const Component = layer.component;
			const comp = new Component({
				data: { canvas, gl, opts: layer.opts },
				store: this.store,
				target: canvas,
				cakeRoot: this.root // TODO, document why we're setting cakeRoot
			});
			return comp;
		});
		this.store.on('update', () => {
			components.forEach(comp => {
				comp.set({ canvas, gl });
			});
		});
	}
	function add_css$4() {
		var style = createElement("style");
		style.id = 'svelte-1v609xu-style';
		style.textContent = ".svelte-ref-webglLayout.svelte-1v609xu{position:absolute}";
		append(document.head, style);
	}

	function create_main_fragment$4(component, ctx) {
		var canvas;

		return {
			c() {
				canvas = createElement("canvas");
				canvas.dataset.layoutIndex = ctx.layoutI;
				canvas.dataset.layoutType = "Webgl";
				setStyle(canvas, "top", "" + ctx.$padding.top + "px");
				setStyle(canvas, "left", "" + ctx.$padding.left + "px");
				setStyle(canvas, "width", "" + ctx.$width + "px");
				setStyle(canvas, "height", "" + ctx.$height + "px" + (ctx.opts.zIndex ? `z-index:${ctx.opts.zIndex};` : ''));
				canvas.className = "svelte-1v609xu svelte-ref-webglLayout";
			},

			m(target, anchor) {
				insert(target, canvas, anchor);
				component.refs.webglLayout = canvas;
			},

			p(changed, ctx) {
				if (changed.layoutI) {
					canvas.dataset.layoutIndex = ctx.layoutI;
				}

				if (changed.$padding) {
					setStyle(canvas, "top", "" + ctx.$padding.top + "px");
					setStyle(canvas, "left", "" + ctx.$padding.left + "px");
				}

				if (changed.$width) {
					setStyle(canvas, "width", "" + ctx.$width + "px");
				}

				if (changed.$height || changed.opts) {
					setStyle(canvas, "height", "" + ctx.$height + "px" + (ctx.opts.zIndex ? `z-index:${ctx.opts.zIndex};` : ''));
				}
			},

			d(detach) {
				if (detach) {
					detachNode(canvas);
				}

				if (component.refs.webglLayout === canvas) component.refs.webglLayout = null;
			}
		};
	}

	function Webgl(options) {
		init(this, options);
		this.refs = {};
		this._state = assign(this.store._init(["padding","width","height"]), options.data);
		this.store._add(this, ["padding","width","height"]);
		this._intro = true;

		this._handlers.destroy = [removeFromStore];

		if (!document.getElementById("svelte-1v609xu-style")) add_css$4();

		this._fragment = create_main_fragment$4(this, this._state);

		this.root._oncreate.push(() => {
			oncreate$1.call(this);
			this.fire("update", { changed: assignTrue({}, this._state), current: this._state });
		});

		if (options.target) {
			this._fragment.c();
			this._mount(options.target, options.anchor);

			flush(this);
		}
	}

	assign(Webgl.prototype, proto);

	function ascending(a, b) {
	  return a < b ? -1 : a > b ? 1 : a >= b ? 0 : NaN;
	}

	function bisector(compare) {
	  if (compare.length === 1) compare = ascendingComparator(compare);
	  return {
	    left: function(a, x, lo, hi) {
	      if (lo == null) lo = 0;
	      if (hi == null) hi = a.length;
	      while (lo < hi) {
	        var mid = lo + hi >>> 1;
	        if (compare(a[mid], x) < 0) lo = mid + 1;
	        else hi = mid;
	      }
	      return lo;
	    },
	    right: function(a, x, lo, hi) {
	      if (lo == null) lo = 0;
	      if (hi == null) hi = a.length;
	      while (lo < hi) {
	        var mid = lo + hi >>> 1;
	        if (compare(a[mid], x) > 0) hi = mid;
	        else lo = mid + 1;
	      }
	      return lo;
	    }
	  };
	}

	function ascendingComparator(f) {
	  return function(d, x) {
	    return ascending(f(d), x);
	  };
	}

	var ascendingBisect = bisector(ascending);
	var bisectRight = ascendingBisect.right;

	var e10 = Math.sqrt(50),
	    e5 = Math.sqrt(10),
	    e2 = Math.sqrt(2);

	function ticks(start, stop, count) {
	  var reverse,
	      i = -1,
	      n,
	      ticks,
	      step;

	  stop = +stop, start = +start, count = +count;
	  if (start === stop && count > 0) return [start];
	  if (reverse = stop < start) n = start, start = stop, stop = n;
	  if ((step = tickIncrement(start, stop, count)) === 0 || !isFinite(step)) return [];

	  if (step > 0) {
	    start = Math.ceil(start / step);
	    stop = Math.floor(stop / step);
	    ticks = new Array(n = Math.ceil(stop - start + 1));
	    while (++i < n) ticks[i] = (start + i) * step;
	  } else {
	    start = Math.floor(start * step);
	    stop = Math.ceil(stop * step);
	    ticks = new Array(n = Math.ceil(start - stop + 1));
	    while (++i < n) ticks[i] = (start - i) / step;
	  }

	  if (reverse) ticks.reverse();

	  return ticks;
	}

	function tickIncrement(start, stop, count) {
	  var step = (stop - start) / Math.max(0, count),
	      power = Math.floor(Math.log(step) / Math.LN10),
	      error = step / Math.pow(10, power);
	  return power >= 0
	      ? (error >= e10 ? 10 : error >= e5 ? 5 : error >= e2 ? 2 : 1) * Math.pow(10, power)
	      : -Math.pow(10, -power) / (error >= e10 ? 10 : error >= e5 ? 5 : error >= e2 ? 2 : 1);
	}

	function tickStep(start, stop, count) {
	  var step0 = Math.abs(stop - start) / Math.max(0, count),
	      step1 = Math.pow(10, Math.floor(Math.log(step0) / Math.LN10)),
	      error = step0 / step1;
	  if (error >= e10) step1 *= 10;
	  else if (error >= e5) step1 *= 5;
	  else if (error >= e2) step1 *= 2;
	  return stop < start ? -step1 : step1;
	}

	function initRange(domain, range) {
	  switch (arguments.length) {
	    case 0: break;
	    case 1: this.range(domain); break;
	    default: this.range(range).domain(domain); break;
	  }
	  return this;
	}

	var prefix = "$";

	function Map() {}

	Map.prototype = map.prototype = {
	  constructor: Map,
	  has: function(key) {
	    return (prefix + key) in this;
	  },
	  get: function(key) {
	    return this[prefix + key];
	  },
	  set: function(key, value) {
	    this[prefix + key] = value;
	    return this;
	  },
	  remove: function(key) {
	    var property = prefix + key;
	    return property in this && delete this[property];
	  },
	  clear: function() {
	    for (var property in this) if (property[0] === prefix) delete this[property];
	  },
	  keys: function() {
	    var keys = [];
	    for (var property in this) if (property[0] === prefix) keys.push(property.slice(1));
	    return keys;
	  },
	  values: function() {
	    var values = [];
	    for (var property in this) if (property[0] === prefix) values.push(this[property]);
	    return values;
	  },
	  entries: function() {
	    var entries = [];
	    for (var property in this) if (property[0] === prefix) entries.push({key: property.slice(1), value: this[property]});
	    return entries;
	  },
	  size: function() {
	    var size = 0;
	    for (var property in this) if (property[0] === prefix) ++size;
	    return size;
	  },
	  empty: function() {
	    for (var property in this) if (property[0] === prefix) return false;
	    return true;
	  },
	  each: function(f) {
	    for (var property in this) if (property[0] === prefix) f(this[property], property.slice(1), this);
	  }
	};

	function map(object, f) {
	  var map = new Map;

	  // Copy constructor.
	  if (object instanceof Map) object.each(function(value, key) { map.set(key, value); });

	  // Index array by numeric index or specified key function.
	  else if (Array.isArray(object)) {
	    var i = -1,
	        n = object.length,
	        o;

	    if (f == null) while (++i < n) map.set(i, object[i]);
	    else while (++i < n) map.set(f(o = object[i], i, object), o);
	  }

	  // Convert object to map.
	  else if (object) for (var key in object) map.set(key, object[key]);

	  return map;
	}

	function Set() {}

	var proto$1 = map.prototype;

	Set.prototype = set$1.prototype = {
	  constructor: Set,
	  has: proto$1.has,
	  add: function(value) {
	    value += "";
	    this[prefix + value] = value;
	    return this;
	  },
	  remove: proto$1.remove,
	  clear: proto$1.clear,
	  values: proto$1.keys,
	  size: proto$1.size,
	  empty: proto$1.empty,
	  each: proto$1.each
	};

	function set$1(object, f) {
	  var set = new Set;

	  // Copy constructor.
	  if (object instanceof Set) object.each(function(value) { set.add(value); });

	  // Otherwise, assume it’s an array.
	  else if (object) {
	    var i = -1, n = object.length;
	    if (f == null) while (++i < n) set.add(object[i]);
	    else while (++i < n) set.add(f(object[i], i, object));
	  }

	  return set;
	}

	var array = Array.prototype;

	var map$1 = array.map;
	var slice = array.slice;

	function define(constructor, factory, prototype) {
	  constructor.prototype = factory.prototype = prototype;
	  prototype.constructor = constructor;
	}

	function extend(parent, definition) {
	  var prototype = Object.create(parent.prototype);
	  for (var key in definition) prototype[key] = definition[key];
	  return prototype;
	}

	function Color() {}

	var darker = 0.7;
	var brighter = 1 / darker;

	var reI = "\\s*([+-]?\\d+)\\s*",
	    reN = "\\s*([+-]?\\d*\\.?\\d+(?:[eE][+-]?\\d+)?)\\s*",
	    reP = "\\s*([+-]?\\d*\\.?\\d+(?:[eE][+-]?\\d+)?)%\\s*",
	    reHex3 = /^#([0-9a-f]{3})$/,
	    reHex6 = /^#([0-9a-f]{6})$/,
	    reRgbInteger = new RegExp("^rgb\\(" + [reI, reI, reI] + "\\)$"),
	    reRgbPercent = new RegExp("^rgb\\(" + [reP, reP, reP] + "\\)$"),
	    reRgbaInteger = new RegExp("^rgba\\(" + [reI, reI, reI, reN] + "\\)$"),
	    reRgbaPercent = new RegExp("^rgba\\(" + [reP, reP, reP, reN] + "\\)$"),
	    reHslPercent = new RegExp("^hsl\\(" + [reN, reP, reP] + "\\)$"),
	    reHslaPercent = new RegExp("^hsla\\(" + [reN, reP, reP, reN] + "\\)$");

	var named = {
	  aliceblue: 0xf0f8ff,
	  antiquewhite: 0xfaebd7,
	  aqua: 0x00ffff,
	  aquamarine: 0x7fffd4,
	  azure: 0xf0ffff,
	  beige: 0xf5f5dc,
	  bisque: 0xffe4c4,
	  black: 0x000000,
	  blanchedalmond: 0xffebcd,
	  blue: 0x0000ff,
	  blueviolet: 0x8a2be2,
	  brown: 0xa52a2a,
	  burlywood: 0xdeb887,
	  cadetblue: 0x5f9ea0,
	  chartreuse: 0x7fff00,
	  chocolate: 0xd2691e,
	  coral: 0xff7f50,
	  cornflowerblue: 0x6495ed,
	  cornsilk: 0xfff8dc,
	  crimson: 0xdc143c,
	  cyan: 0x00ffff,
	  darkblue: 0x00008b,
	  darkcyan: 0x008b8b,
	  darkgoldenrod: 0xb8860b,
	  darkgray: 0xa9a9a9,
	  darkgreen: 0x006400,
	  darkgrey: 0xa9a9a9,
	  darkkhaki: 0xbdb76b,
	  darkmagenta: 0x8b008b,
	  darkolivegreen: 0x556b2f,
	  darkorange: 0xff8c00,
	  darkorchid: 0x9932cc,
	  darkred: 0x8b0000,
	  darksalmon: 0xe9967a,
	  darkseagreen: 0x8fbc8f,
	  darkslateblue: 0x483d8b,
	  darkslategray: 0x2f4f4f,
	  darkslategrey: 0x2f4f4f,
	  darkturquoise: 0x00ced1,
	  darkviolet: 0x9400d3,
	  deeppink: 0xff1493,
	  deepskyblue: 0x00bfff,
	  dimgray: 0x696969,
	  dimgrey: 0x696969,
	  dodgerblue: 0x1e90ff,
	  firebrick: 0xb22222,
	  floralwhite: 0xfffaf0,
	  forestgreen: 0x228b22,
	  fuchsia: 0xff00ff,
	  gainsboro: 0xdcdcdc,
	  ghostwhite: 0xf8f8ff,
	  gold: 0xffd700,
	  goldenrod: 0xdaa520,
	  gray: 0x808080,
	  green: 0x008000,
	  greenyellow: 0xadff2f,
	  grey: 0x808080,
	  honeydew: 0xf0fff0,
	  hotpink: 0xff69b4,
	  indianred: 0xcd5c5c,
	  indigo: 0x4b0082,
	  ivory: 0xfffff0,
	  khaki: 0xf0e68c,
	  lavender: 0xe6e6fa,
	  lavenderblush: 0xfff0f5,
	  lawngreen: 0x7cfc00,
	  lemonchiffon: 0xfffacd,
	  lightblue: 0xadd8e6,
	  lightcoral: 0xf08080,
	  lightcyan: 0xe0ffff,
	  lightgoldenrodyellow: 0xfafad2,
	  lightgray: 0xd3d3d3,
	  lightgreen: 0x90ee90,
	  lightgrey: 0xd3d3d3,
	  lightpink: 0xffb6c1,
	  lightsalmon: 0xffa07a,
	  lightseagreen: 0x20b2aa,
	  lightskyblue: 0x87cefa,
	  lightslategray: 0x778899,
	  lightslategrey: 0x778899,
	  lightsteelblue: 0xb0c4de,
	  lightyellow: 0xffffe0,
	  lime: 0x00ff00,
	  limegreen: 0x32cd32,
	  linen: 0xfaf0e6,
	  magenta: 0xff00ff,
	  maroon: 0x800000,
	  mediumaquamarine: 0x66cdaa,
	  mediumblue: 0x0000cd,
	  mediumorchid: 0xba55d3,
	  mediumpurple: 0x9370db,
	  mediumseagreen: 0x3cb371,
	  mediumslateblue: 0x7b68ee,
	  mediumspringgreen: 0x00fa9a,
	  mediumturquoise: 0x48d1cc,
	  mediumvioletred: 0xc71585,
	  midnightblue: 0x191970,
	  mintcream: 0xf5fffa,
	  mistyrose: 0xffe4e1,
	  moccasin: 0xffe4b5,
	  navajowhite: 0xffdead,
	  navy: 0x000080,
	  oldlace: 0xfdf5e6,
	  olive: 0x808000,
	  olivedrab: 0x6b8e23,
	  orange: 0xffa500,
	  orangered: 0xff4500,
	  orchid: 0xda70d6,
	  palegoldenrod: 0xeee8aa,
	  palegreen: 0x98fb98,
	  paleturquoise: 0xafeeee,
	  palevioletred: 0xdb7093,
	  papayawhip: 0xffefd5,
	  peachpuff: 0xffdab9,
	  peru: 0xcd853f,
	  pink: 0xffc0cb,
	  plum: 0xdda0dd,
	  powderblue: 0xb0e0e6,
	  purple: 0x800080,
	  rebeccapurple: 0x663399,
	  red: 0xff0000,
	  rosybrown: 0xbc8f8f,
	  royalblue: 0x4169e1,
	  saddlebrown: 0x8b4513,
	  salmon: 0xfa8072,
	  sandybrown: 0xf4a460,
	  seagreen: 0x2e8b57,
	  seashell: 0xfff5ee,
	  sienna: 0xa0522d,
	  silver: 0xc0c0c0,
	  skyblue: 0x87ceeb,
	  slateblue: 0x6a5acd,
	  slategray: 0x708090,
	  slategrey: 0x708090,
	  snow: 0xfffafa,
	  springgreen: 0x00ff7f,
	  steelblue: 0x4682b4,
	  tan: 0xd2b48c,
	  teal: 0x008080,
	  thistle: 0xd8bfd8,
	  tomato: 0xff6347,
	  turquoise: 0x40e0d0,
	  violet: 0xee82ee,
	  wheat: 0xf5deb3,
	  white: 0xffffff,
	  whitesmoke: 0xf5f5f5,
	  yellow: 0xffff00,
	  yellowgreen: 0x9acd32
	};

	define(Color, color, {
	  displayable: function() {
	    return this.rgb().displayable();
	  },
	  hex: function() {
	    return this.rgb().hex();
	  },
	  toString: function() {
	    return this.rgb() + "";
	  }
	});

	function color(format) {
	  var m;
	  format = (format + "").trim().toLowerCase();
	  return (m = reHex3.exec(format)) ? (m = parseInt(m[1], 16), new Rgb((m >> 8 & 0xf) | (m >> 4 & 0x0f0), (m >> 4 & 0xf) | (m & 0xf0), ((m & 0xf) << 4) | (m & 0xf), 1)) // #f00
	      : (m = reHex6.exec(format)) ? rgbn(parseInt(m[1], 16)) // #ff0000
	      : (m = reRgbInteger.exec(format)) ? new Rgb(m[1], m[2], m[3], 1) // rgb(255, 0, 0)
	      : (m = reRgbPercent.exec(format)) ? new Rgb(m[1] * 255 / 100, m[2] * 255 / 100, m[3] * 255 / 100, 1) // rgb(100%, 0%, 0%)
	      : (m = reRgbaInteger.exec(format)) ? rgba(m[1], m[2], m[3], m[4]) // rgba(255, 0, 0, 1)
	      : (m = reRgbaPercent.exec(format)) ? rgba(m[1] * 255 / 100, m[2] * 255 / 100, m[3] * 255 / 100, m[4]) // rgb(100%, 0%, 0%, 1)
	      : (m = reHslPercent.exec(format)) ? hsla(m[1], m[2] / 100, m[3] / 100, 1) // hsl(120, 50%, 50%)
	      : (m = reHslaPercent.exec(format)) ? hsla(m[1], m[2] / 100, m[3] / 100, m[4]) // hsla(120, 50%, 50%, 1)
	      : named.hasOwnProperty(format) ? rgbn(named[format])
	      : format === "transparent" ? new Rgb(NaN, NaN, NaN, 0)
	      : null;
	}

	function rgbn(n) {
	  return new Rgb(n >> 16 & 0xff, n >> 8 & 0xff, n & 0xff, 1);
	}

	function rgba(r, g, b, a) {
	  if (a <= 0) r = g = b = NaN;
	  return new Rgb(r, g, b, a);
	}

	function rgbConvert(o) {
	  if (!(o instanceof Color)) o = color(o);
	  if (!o) return new Rgb;
	  o = o.rgb();
	  return new Rgb(o.r, o.g, o.b, o.opacity);
	}

	function rgb(r, g, b, opacity) {
	  return arguments.length === 1 ? rgbConvert(r) : new Rgb(r, g, b, opacity == null ? 1 : opacity);
	}

	function Rgb(r, g, b, opacity) {
	  this.r = +r;
	  this.g = +g;
	  this.b = +b;
	  this.opacity = +opacity;
	}

	define(Rgb, rgb, extend(Color, {
	  brighter: function(k) {
	    k = k == null ? brighter : Math.pow(brighter, k);
	    return new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
	  },
	  darker: function(k) {
	    k = k == null ? darker : Math.pow(darker, k);
	    return new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
	  },
	  rgb: function() {
	    return this;
	  },
	  displayable: function() {
	    return (-0.5 <= this.r && this.r < 255.5)
	        && (-0.5 <= this.g && this.g < 255.5)
	        && (-0.5 <= this.b && this.b < 255.5)
	        && (0 <= this.opacity && this.opacity <= 1);
	  },
	  hex: function() {
	    return "#" + hex(this.r) + hex(this.g) + hex(this.b);
	  },
	  toString: function() {
	    var a = this.opacity; a = isNaN(a) ? 1 : Math.max(0, Math.min(1, a));
	    return (a === 1 ? "rgb(" : "rgba(")
	        + Math.max(0, Math.min(255, Math.round(this.r) || 0)) + ", "
	        + Math.max(0, Math.min(255, Math.round(this.g) || 0)) + ", "
	        + Math.max(0, Math.min(255, Math.round(this.b) || 0))
	        + (a === 1 ? ")" : ", " + a + ")");
	  }
	}));

	function hex(value) {
	  value = Math.max(0, Math.min(255, Math.round(value) || 0));
	  return (value < 16 ? "0" : "") + value.toString(16);
	}

	function hsla(h, s, l, a) {
	  if (a <= 0) h = s = l = NaN;
	  else if (l <= 0 || l >= 1) h = s = NaN;
	  else if (s <= 0) h = NaN;
	  return new Hsl(h, s, l, a);
	}

	function hslConvert(o) {
	  if (o instanceof Hsl) return new Hsl(o.h, o.s, o.l, o.opacity);
	  if (!(o instanceof Color)) o = color(o);
	  if (!o) return new Hsl;
	  if (o instanceof Hsl) return o;
	  o = o.rgb();
	  var r = o.r / 255,
	      g = o.g / 255,
	      b = o.b / 255,
	      min = Math.min(r, g, b),
	      max = Math.max(r, g, b),
	      h = NaN,
	      s = max - min,
	      l = (max + min) / 2;
	  if (s) {
	    if (r === max) h = (g - b) / s + (g < b) * 6;
	    else if (g === max) h = (b - r) / s + 2;
	    else h = (r - g) / s + 4;
	    s /= l < 0.5 ? max + min : 2 - max - min;
	    h *= 60;
	  } else {
	    s = l > 0 && l < 1 ? 0 : h;
	  }
	  return new Hsl(h, s, l, o.opacity);
	}

	function hsl(h, s, l, opacity) {
	  return arguments.length === 1 ? hslConvert(h) : new Hsl(h, s, l, opacity == null ? 1 : opacity);
	}

	function Hsl(h, s, l, opacity) {
	  this.h = +h;
	  this.s = +s;
	  this.l = +l;
	  this.opacity = +opacity;
	}

	define(Hsl, hsl, extend(Color, {
	  brighter: function(k) {
	    k = k == null ? brighter : Math.pow(brighter, k);
	    return new Hsl(this.h, this.s, this.l * k, this.opacity);
	  },
	  darker: function(k) {
	    k = k == null ? darker : Math.pow(darker, k);
	    return new Hsl(this.h, this.s, this.l * k, this.opacity);
	  },
	  rgb: function() {
	    var h = this.h % 360 + (this.h < 0) * 360,
	        s = isNaN(h) || isNaN(this.s) ? 0 : this.s,
	        l = this.l,
	        m2 = l + (l < 0.5 ? l : 1 - l) * s,
	        m1 = 2 * l - m2;
	    return new Rgb(
	      hsl2rgb(h >= 240 ? h - 240 : h + 120, m1, m2),
	      hsl2rgb(h, m1, m2),
	      hsl2rgb(h < 120 ? h + 240 : h - 120, m1, m2),
	      this.opacity
	    );
	  },
	  displayable: function() {
	    return (0 <= this.s && this.s <= 1 || isNaN(this.s))
	        && (0 <= this.l && this.l <= 1)
	        && (0 <= this.opacity && this.opacity <= 1);
	  }
	}));

	/* From FvD 13.37, CSS Color Module Level 3 */
	function hsl2rgb(h, m1, m2) {
	  return (h < 60 ? m1 + (m2 - m1) * h / 60
	      : h < 180 ? m2
	      : h < 240 ? m1 + (m2 - m1) * (240 - h) / 60
	      : m1) * 255;
	}

	var deg2rad = Math.PI / 180;
	var rad2deg = 180 / Math.PI;

	// https://observablehq.com/@mbostock/lab-and-rgb
	var K = 18,
	    Xn = 0.96422,
	    Yn = 1,
	    Zn = 0.82521,
	    t0 = 4 / 29,
	    t1 = 6 / 29,
	    t2 = 3 * t1 * t1,
	    t3 = t1 * t1 * t1;

	function labConvert(o) {
	  if (o instanceof Lab) return new Lab(o.l, o.a, o.b, o.opacity);
	  if (o instanceof Hcl) return hcl2lab(o);
	  if (!(o instanceof Rgb)) o = rgbConvert(o);
	  var r = rgb2lrgb(o.r),
	      g = rgb2lrgb(o.g),
	      b = rgb2lrgb(o.b),
	      y = xyz2lab((0.2225045 * r + 0.7168786 * g + 0.0606169 * b) / Yn), x, z;
	  if (r === g && g === b) x = z = y; else {
	    x = xyz2lab((0.4360747 * r + 0.3850649 * g + 0.1430804 * b) / Xn);
	    z = xyz2lab((0.0139322 * r + 0.0971045 * g + 0.7141733 * b) / Zn);
	  }
	  return new Lab(116 * y - 16, 500 * (x - y), 200 * (y - z), o.opacity);
	}

	function lab(l, a, b, opacity) {
	  return arguments.length === 1 ? labConvert(l) : new Lab(l, a, b, opacity == null ? 1 : opacity);
	}

	function Lab(l, a, b, opacity) {
	  this.l = +l;
	  this.a = +a;
	  this.b = +b;
	  this.opacity = +opacity;
	}

	define(Lab, lab, extend(Color, {
	  brighter: function(k) {
	    return new Lab(this.l + K * (k == null ? 1 : k), this.a, this.b, this.opacity);
	  },
	  darker: function(k) {
	    return new Lab(this.l - K * (k == null ? 1 : k), this.a, this.b, this.opacity);
	  },
	  rgb: function() {
	    var y = (this.l + 16) / 116,
	        x = isNaN(this.a) ? y : y + this.a / 500,
	        z = isNaN(this.b) ? y : y - this.b / 200;
	    x = Xn * lab2xyz(x);
	    y = Yn * lab2xyz(y);
	    z = Zn * lab2xyz(z);
	    return new Rgb(
	      lrgb2rgb( 3.1338561 * x - 1.6168667 * y - 0.4906146 * z),
	      lrgb2rgb(-0.9787684 * x + 1.9161415 * y + 0.0334540 * z),
	      lrgb2rgb( 0.0719453 * x - 0.2289914 * y + 1.4052427 * z),
	      this.opacity
	    );
	  }
	}));

	function xyz2lab(t) {
	  return t > t3 ? Math.pow(t, 1 / 3) : t / t2 + t0;
	}

	function lab2xyz(t) {
	  return t > t1 ? t * t * t : t2 * (t - t0);
	}

	function lrgb2rgb(x) {
	  return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
	}

	function rgb2lrgb(x) {
	  return (x /= 255) <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
	}

	function hclConvert(o) {
	  if (o instanceof Hcl) return new Hcl(o.h, o.c, o.l, o.opacity);
	  if (!(o instanceof Lab)) o = labConvert(o);
	  if (o.a === 0 && o.b === 0) return new Hcl(NaN, 0 < o.l && o.l < 100 ? 0 : NaN, o.l, o.opacity);
	  var h = Math.atan2(o.b, o.a) * rad2deg;
	  return new Hcl(h < 0 ? h + 360 : h, Math.sqrt(o.a * o.a + o.b * o.b), o.l, o.opacity);
	}

	function hcl(h, c, l, opacity) {
	  return arguments.length === 1 ? hclConvert(h) : new Hcl(h, c, l, opacity == null ? 1 : opacity);
	}

	function Hcl(h, c, l, opacity) {
	  this.h = +h;
	  this.c = +c;
	  this.l = +l;
	  this.opacity = +opacity;
	}

	function hcl2lab(o) {
	  if (isNaN(o.h)) return new Lab(o.l, 0, 0, o.opacity);
	  var h = o.h * deg2rad;
	  return new Lab(o.l, Math.cos(h) * o.c, Math.sin(h) * o.c, o.opacity);
	}

	define(Hcl, hcl, extend(Color, {
	  brighter: function(k) {
	    return new Hcl(this.h, this.c, this.l + K * (k == null ? 1 : k), this.opacity);
	  },
	  darker: function(k) {
	    return new Hcl(this.h, this.c, this.l - K * (k == null ? 1 : k), this.opacity);
	  },
	  rgb: function() {
	    return hcl2lab(this).rgb();
	  }
	}));

	var A = -0.14861,
	    B = +1.78277,
	    C = -0.29227,
	    D = -0.90649,
	    E = +1.97294,
	    ED = E * D,
	    EB = E * B,
	    BC_DA = B * C - D * A;

	function cubehelixConvert(o) {
	  if (o instanceof Cubehelix) return new Cubehelix(o.h, o.s, o.l, o.opacity);
	  if (!(o instanceof Rgb)) o = rgbConvert(o);
	  var r = o.r / 255,
	      g = o.g / 255,
	      b = o.b / 255,
	      l = (BC_DA * b + ED * r - EB * g) / (BC_DA + ED - EB),
	      bl = b - l,
	      k = (E * (g - l) - C * bl) / D,
	      s = Math.sqrt(k * k + bl * bl) / (E * l * (1 - l)), // NaN if l=0 or l=1
	      h = s ? Math.atan2(k, bl) * rad2deg - 120 : NaN;
	  return new Cubehelix(h < 0 ? h + 360 : h, s, l, o.opacity);
	}

	function cubehelix(h, s, l, opacity) {
	  return arguments.length === 1 ? cubehelixConvert(h) : new Cubehelix(h, s, l, opacity == null ? 1 : opacity);
	}

	function Cubehelix(h, s, l, opacity) {
	  this.h = +h;
	  this.s = +s;
	  this.l = +l;
	  this.opacity = +opacity;
	}

	define(Cubehelix, cubehelix, extend(Color, {
	  brighter: function(k) {
	    k = k == null ? brighter : Math.pow(brighter, k);
	    return new Cubehelix(this.h, this.s, this.l * k, this.opacity);
	  },
	  darker: function(k) {
	    k = k == null ? darker : Math.pow(darker, k);
	    return new Cubehelix(this.h, this.s, this.l * k, this.opacity);
	  },
	  rgb: function() {
	    var h = isNaN(this.h) ? 0 : (this.h + 120) * deg2rad,
	        l = +this.l,
	        a = isNaN(this.s) ? 0 : this.s * l * (1 - l),
	        cosh = Math.cos(h),
	        sinh = Math.sin(h);
	    return new Rgb(
	      255 * (l + a * (A * cosh + B * sinh)),
	      255 * (l + a * (C * cosh + D * sinh)),
	      255 * (l + a * (E * cosh)),
	      this.opacity
	    );
	  }
	}));

	function constant(x) {
	  return function() {
	    return x;
	  };
	}

	function linear(a, d) {
	  return function(t) {
	    return a + t * d;
	  };
	}

	function exponential(a, b, y) {
	  return a = Math.pow(a, y), b = Math.pow(b, y) - a, y = 1 / y, function(t) {
	    return Math.pow(a + t * b, y);
	  };
	}

	function gamma(y) {
	  return (y = +y) === 1 ? nogamma : function(a, b) {
	    return b - a ? exponential(a, b, y) : constant(isNaN(a) ? b : a);
	  };
	}

	function nogamma(a, b) {
	  var d = b - a;
	  return d ? linear(a, d) : constant(isNaN(a) ? b : a);
	}

	var rgb$1 = (function rgbGamma(y) {
	  var color = gamma(y);

	  function rgb$1(start, end) {
	    var r = color((start = rgb(start)).r, (end = rgb(end)).r),
	        g = color(start.g, end.g),
	        b = color(start.b, end.b),
	        opacity = nogamma(start.opacity, end.opacity);
	    return function(t) {
	      start.r = r(t);
	      start.g = g(t);
	      start.b = b(t);
	      start.opacity = opacity(t);
	      return start + "";
	    };
	  }

	  rgb$1.gamma = rgbGamma;

	  return rgb$1;
	})(1);

	function array$1(a, b) {
	  var nb = b ? b.length : 0,
	      na = a ? Math.min(nb, a.length) : 0,
	      x = new Array(na),
	      c = new Array(nb),
	      i;

	  for (i = 0; i < na; ++i) x[i] = interpolateValue(a[i], b[i]);
	  for (; i < nb; ++i) c[i] = b[i];

	  return function(t) {
	    for (i = 0; i < na; ++i) c[i] = x[i](t);
	    return c;
	  };
	}

	function date(a, b) {
	  var d = new Date;
	  return a = +a, b -= a, function(t) {
	    return d.setTime(a + b * t), d;
	  };
	}

	function interpolateNumber(a, b) {
	  return a = +a, b -= a, function(t) {
	    return a + b * t;
	  };
	}

	function object(a, b) {
	  var i = {},
	      c = {},
	      k;

	  if (a === null || typeof a !== "object") a = {};
	  if (b === null || typeof b !== "object") b = {};

	  for (k in b) {
	    if (k in a) {
	      i[k] = interpolateValue(a[k], b[k]);
	    } else {
	      c[k] = b[k];
	    }
	  }

	  return function(t) {
	    for (k in i) c[k] = i[k](t);
	    return c;
	  };
	}

	var reA = /[-+]?(?:\d+\.?\d*|\.?\d+)(?:[eE][-+]?\d+)?/g,
	    reB = new RegExp(reA.source, "g");

	function zero(b) {
	  return function() {
	    return b;
	  };
	}

	function one(b) {
	  return function(t) {
	    return b(t) + "";
	  };
	}

	function string(a, b) {
	  var bi = reA.lastIndex = reB.lastIndex = 0, // scan index for next number in b
	      am, // current match in a
	      bm, // current match in b
	      bs, // string preceding current number in b, if any
	      i = -1, // index in s
	      s = [], // string constants and placeholders
	      q = []; // number interpolators

	  // Coerce inputs to strings.
	  a = a + "", b = b + "";

	  // Interpolate pairs of numbers in a & b.
	  while ((am = reA.exec(a))
	      && (bm = reB.exec(b))) {
	    if ((bs = bm.index) > bi) { // a string precedes the next number in b
	      bs = b.slice(bi, bs);
	      if (s[i]) s[i] += bs; // coalesce with previous string
	      else s[++i] = bs;
	    }
	    if ((am = am[0]) === (bm = bm[0])) { // numbers in a & b match
	      if (s[i]) s[i] += bm; // coalesce with previous string
	      else s[++i] = bm;
	    } else { // interpolate non-matching numbers
	      s[++i] = null;
	      q.push({i: i, x: interpolateNumber(am, bm)});
	    }
	    bi = reB.lastIndex;
	  }

	  // Add remains of b.
	  if (bi < b.length) {
	    bs = b.slice(bi);
	    if (s[i]) s[i] += bs; // coalesce with previous string
	    else s[++i] = bs;
	  }

	  // Special optimization for only a single match.
	  // Otherwise, interpolate each of the numbers and rejoin the string.
	  return s.length < 2 ? (q[0]
	      ? one(q[0].x)
	      : zero(b))
	      : (b = q.length, function(t) {
	          for (var i = 0, o; i < b; ++i) s[(o = q[i]).i] = o.x(t);
	          return s.join("");
	        });
	}

	function interpolateValue(a, b) {
	  var t = typeof b, c;
	  return b == null || t === "boolean" ? constant(b)
	      : (t === "number" ? interpolateNumber
	      : t === "string" ? ((c = color(b)) ? (b = c, rgb$1) : string)
	      : b instanceof color ? rgb$1
	      : b instanceof Date ? date
	      : Array.isArray(b) ? array$1
	      : typeof b.valueOf !== "function" && typeof b.toString !== "function" || isNaN(b) ? object
	      : interpolateNumber)(a, b);
	}

	function interpolateRound(a, b) {
	  return a = +a, b -= a, function(t) {
	    return Math.round(a + b * t);
	  };
	}

	var degrees = 180 / Math.PI;

	var rho = Math.SQRT2;

	function constant$1(x) {
	  return function() {
	    return x;
	  };
	}

	function number(x) {
	  return +x;
	}

	var unit = [0, 1];

	function identity(x) {
	  return x;
	}

	function normalize(a, b) {
	  return (b -= (a = +a))
	      ? function(x) { return (x - a) / b; }
	      : constant$1(isNaN(b) ? NaN : 0.5);
	}

	function clamper(domain) {
	  var a = domain[0], b = domain[domain.length - 1], t;
	  if (a > b) t = a, a = b, b = t;
	  return function(x) { return Math.max(a, Math.min(b, x)); };
	}

	// normalize(a, b)(x) takes a domain value x in [a,b] and returns the corresponding parameter t in [0,1].
	// interpolate(a, b)(t) takes a parameter t in [0,1] and returns the corresponding range value x in [a,b].
	function bimap(domain, range, interpolate) {
	  var d0 = domain[0], d1 = domain[1], r0 = range[0], r1 = range[1];
	  if (d1 < d0) d0 = normalize(d1, d0), r0 = interpolate(r1, r0);
	  else d0 = normalize(d0, d1), r0 = interpolate(r0, r1);
	  return function(x) { return r0(d0(x)); };
	}

	function polymap(domain, range, interpolate) {
	  var j = Math.min(domain.length, range.length) - 1,
	      d = new Array(j),
	      r = new Array(j),
	      i = -1;

	  // Reverse descending domains.
	  if (domain[j] < domain[0]) {
	    domain = domain.slice().reverse();
	    range = range.slice().reverse();
	  }

	  while (++i < j) {
	    d[i] = normalize(domain[i], domain[i + 1]);
	    r[i] = interpolate(range[i], range[i + 1]);
	  }

	  return function(x) {
	    var i = bisectRight(domain, x, 1, j) - 1;
	    return r[i](d[i](x));
	  };
	}

	function copy(source, target) {
	  return target
	      .domain(source.domain())
	      .range(source.range())
	      .interpolate(source.interpolate())
	      .clamp(source.clamp())
	      .unknown(source.unknown());
	}

	function transformer() {
	  var domain = unit,
	      range = unit,
	      interpolate = interpolateValue,
	      transform,
	      untransform,
	      unknown,
	      clamp = identity,
	      piecewise,
	      output,
	      input;

	  function rescale() {
	    piecewise = Math.min(domain.length, range.length) > 2 ? polymap : bimap;
	    output = input = null;
	    return scale;
	  }

	  function scale(x) {
	    return isNaN(x = +x) ? unknown : (output || (output = piecewise(domain.map(transform), range, interpolate)))(transform(clamp(x)));
	  }

	  scale.invert = function(y) {
	    return clamp(untransform((input || (input = piecewise(range, domain.map(transform), interpolateNumber)))(y)));
	  };

	  scale.domain = function(_) {
	    return arguments.length ? (domain = map$1.call(_, number), clamp === identity || (clamp = clamper(domain)), rescale()) : domain.slice();
	  };

	  scale.range = function(_) {
	    return arguments.length ? (range = slice.call(_), rescale()) : range.slice();
	  };

	  scale.rangeRound = function(_) {
	    return range = slice.call(_), interpolate = interpolateRound, rescale();
	  };

	  scale.clamp = function(_) {
	    return arguments.length ? (clamp = _ ? clamper(domain) : identity, scale) : clamp !== identity;
	  };

	  scale.interpolate = function(_) {
	    return arguments.length ? (interpolate = _, rescale()) : interpolate;
	  };

	  scale.unknown = function(_) {
	    return arguments.length ? (unknown = _, scale) : unknown;
	  };

	  return function(t, u) {
	    transform = t, untransform = u;
	    return rescale();
	  };
	}

	function continuous(transform, untransform) {
	  return transformer()(transform, untransform);
	}

	// Computes the decimal coefficient and exponent of the specified number x with
	// significant digits p, where x is positive and p is in [1, 21] or undefined.
	// For example, formatDecimal(1.23) returns ["123", 0].
	function formatDecimal(x, p) {
	  if ((i = (x = p ? x.toExponential(p - 1) : x.toExponential()).indexOf("e")) < 0) return null; // NaN, ±Infinity
	  var i, coefficient = x.slice(0, i);

	  // The string returned by toExponential either has the form \d\.\d+e[-+]\d+
	  // (e.g., 1.2e+3) or the form \de[-+]\d+ (e.g., 1e+3).
	  return [
	    coefficient.length > 1 ? coefficient[0] + coefficient.slice(2) : coefficient,
	    +x.slice(i + 1)
	  ];
	}

	function exponent(x) {
	  return x = formatDecimal(Math.abs(x)), x ? x[1] : NaN;
	}

	function formatGroup(grouping, thousands) {
	  return function(value, width) {
	    var i = value.length,
	        t = [],
	        j = 0,
	        g = grouping[0],
	        length = 0;

	    while (i > 0 && g > 0) {
	      if (length + g + 1 > width) g = Math.max(1, width - length);
	      t.push(value.substring(i -= g, i + g));
	      if ((length += g + 1) > width) break;
	      g = grouping[j = (j + 1) % grouping.length];
	    }

	    return t.reverse().join(thousands);
	  };
	}

	function formatNumerals(numerals) {
	  return function(value) {
	    return value.replace(/[0-9]/g, function(i) {
	      return numerals[+i];
	    });
	  };
	}

	// [[fill]align][sign][symbol][0][width][,][.precision][~][type]
	var re = /^(?:(.)?([<>=^]))?([+\-( ])?([$#])?(0)?(\d+)?(,)?(\.\d+)?(~)?([a-z%])?$/i;

	function formatSpecifier(specifier) {
	  return new FormatSpecifier(specifier);
	}

	formatSpecifier.prototype = FormatSpecifier.prototype; // instanceof

	function FormatSpecifier(specifier) {
	  if (!(match = re.exec(specifier))) throw new Error("invalid format: " + specifier);
	  var match;
	  this.fill = match[1] || " ";
	  this.align = match[2] || ">";
	  this.sign = match[3] || "-";
	  this.symbol = match[4] || "";
	  this.zero = !!match[5];
	  this.width = match[6] && +match[6];
	  this.comma = !!match[7];
	  this.precision = match[8] && +match[8].slice(1);
	  this.trim = !!match[9];
	  this.type = match[10] || "";
	}

	FormatSpecifier.prototype.toString = function() {
	  return this.fill
	      + this.align
	      + this.sign
	      + this.symbol
	      + (this.zero ? "0" : "")
	      + (this.width == null ? "" : Math.max(1, this.width | 0))
	      + (this.comma ? "," : "")
	      + (this.precision == null ? "" : "." + Math.max(0, this.precision | 0))
	      + (this.trim ? "~" : "")
	      + this.type;
	};

	// Trims insignificant zeros, e.g., replaces 1.2000k with 1.2k.
	function formatTrim(s) {
	  out: for (var n = s.length, i = 1, i0 = -1, i1; i < n; ++i) {
	    switch (s[i]) {
	      case ".": i0 = i1 = i; break;
	      case "0": if (i0 === 0) i0 = i; i1 = i; break;
	      default: if (i0 > 0) { if (!+s[i]) break out; i0 = 0; } break;
	    }
	  }
	  return i0 > 0 ? s.slice(0, i0) + s.slice(i1 + 1) : s;
	}

	var prefixExponent;

	function formatPrefixAuto(x, p) {
	  var d = formatDecimal(x, p);
	  if (!d) return x + "";
	  var coefficient = d[0],
	      exponent = d[1],
	      i = exponent - (prefixExponent = Math.max(-8, Math.min(8, Math.floor(exponent / 3))) * 3) + 1,
	      n = coefficient.length;
	  return i === n ? coefficient
	      : i > n ? coefficient + new Array(i - n + 1).join("0")
	      : i > 0 ? coefficient.slice(0, i) + "." + coefficient.slice(i)
	      : "0." + new Array(1 - i).join("0") + formatDecimal(x, Math.max(0, p + i - 1))[0]; // less than 1y!
	}

	function formatRounded(x, p) {
	  var d = formatDecimal(x, p);
	  if (!d) return x + "";
	  var coefficient = d[0],
	      exponent = d[1];
	  return exponent < 0 ? "0." + new Array(-exponent).join("0") + coefficient
	      : coefficient.length > exponent + 1 ? coefficient.slice(0, exponent + 1) + "." + coefficient.slice(exponent + 1)
	      : coefficient + new Array(exponent - coefficient.length + 2).join("0");
	}

	var formatTypes = {
	  "%": function(x, p) { return (x * 100).toFixed(p); },
	  "b": function(x) { return Math.round(x).toString(2); },
	  "c": function(x) { return x + ""; },
	  "d": function(x) { return Math.round(x).toString(10); },
	  "e": function(x, p) { return x.toExponential(p); },
	  "f": function(x, p) { return x.toFixed(p); },
	  "g": function(x, p) { return x.toPrecision(p); },
	  "o": function(x) { return Math.round(x).toString(8); },
	  "p": function(x, p) { return formatRounded(x * 100, p); },
	  "r": formatRounded,
	  "s": formatPrefixAuto,
	  "X": function(x) { return Math.round(x).toString(16).toUpperCase(); },
	  "x": function(x) { return Math.round(x).toString(16); }
	};

	function identity$1(x) {
	  return x;
	}

	var prefixes = ["y","z","a","f","p","n","µ","m","","k","M","G","T","P","E","Z","Y"];

	function formatLocale(locale) {
	  var group = locale.grouping && locale.thousands ? formatGroup(locale.grouping, locale.thousands) : identity$1,
	      currency = locale.currency,
	      decimal = locale.decimal,
	      numerals = locale.numerals ? formatNumerals(locale.numerals) : identity$1,
	      percent = locale.percent || "%";

	  function newFormat(specifier) {
	    specifier = formatSpecifier(specifier);

	    var fill = specifier.fill,
	        align = specifier.align,
	        sign = specifier.sign,
	        symbol = specifier.symbol,
	        zero = specifier.zero,
	        width = specifier.width,
	        comma = specifier.comma,
	        precision = specifier.precision,
	        trim = specifier.trim,
	        type = specifier.type;

	    // The "n" type is an alias for ",g".
	    if (type === "n") comma = true, type = "g";

	    // The "" type, and any invalid type, is an alias for ".12~g".
	    else if (!formatTypes[type]) precision == null && (precision = 12), trim = true, type = "g";

	    // If zero fill is specified, padding goes after sign and before digits.
	    if (zero || (fill === "0" && align === "=")) zero = true, fill = "0", align = "=";

	    // Compute the prefix and suffix.
	    // For SI-prefix, the suffix is lazily computed.
	    var prefix = symbol === "$" ? currency[0] : symbol === "#" && /[boxX]/.test(type) ? "0" + type.toLowerCase() : "",
	        suffix = symbol === "$" ? currency[1] : /[%p]/.test(type) ? percent : "";

	    // What format function should we use?
	    // Is this an integer type?
	    // Can this type generate exponential notation?
	    var formatType = formatTypes[type],
	        maybeSuffix = /[defgprs%]/.test(type);

	    // Set the default precision if not specified,
	    // or clamp the specified precision to the supported range.
	    // For significant precision, it must be in [1, 21].
	    // For fixed precision, it must be in [0, 20].
	    precision = precision == null ? 6
	        : /[gprs]/.test(type) ? Math.max(1, Math.min(21, precision))
	        : Math.max(0, Math.min(20, precision));

	    function format(value) {
	      var valuePrefix = prefix,
	          valueSuffix = suffix,
	          i, n, c;

	      if (type === "c") {
	        valueSuffix = formatType(value) + valueSuffix;
	        value = "";
	      } else {
	        value = +value;

	        // Perform the initial formatting.
	        var valueNegative = value < 0;
	        value = formatType(Math.abs(value), precision);

	        // Trim insignificant zeros.
	        if (trim) value = formatTrim(value);

	        // If a negative value rounds to zero during formatting, treat as positive.
	        if (valueNegative && +value === 0) valueNegative = false;

	        // Compute the prefix and suffix.
	        valuePrefix = (valueNegative ? (sign === "(" ? sign : "-") : sign === "-" || sign === "(" ? "" : sign) + valuePrefix;
	        valueSuffix = (type === "s" ? prefixes[8 + prefixExponent / 3] : "") + valueSuffix + (valueNegative && sign === "(" ? ")" : "");

	        // Break the formatted value into the integer “value” part that can be
	        // grouped, and fractional or exponential “suffix” part that is not.
	        if (maybeSuffix) {
	          i = -1, n = value.length;
	          while (++i < n) {
	            if (c = value.charCodeAt(i), 48 > c || c > 57) {
	              valueSuffix = (c === 46 ? decimal + value.slice(i + 1) : value.slice(i)) + valueSuffix;
	              value = value.slice(0, i);
	              break;
	            }
	          }
	        }
	      }

	      // If the fill character is not "0", grouping is applied before padding.
	      if (comma && !zero) value = group(value, Infinity);

	      // Compute the padding.
	      var length = valuePrefix.length + value.length + valueSuffix.length,
	          padding = length < width ? new Array(width - length + 1).join(fill) : "";

	      // If the fill character is "0", grouping is applied after padding.
	      if (comma && zero) value = group(padding + value, padding.length ? width - valueSuffix.length : Infinity), padding = "";

	      // Reconstruct the final output based on the desired alignment.
	      switch (align) {
	        case "<": value = valuePrefix + value + valueSuffix + padding; break;
	        case "=": value = valuePrefix + padding + value + valueSuffix; break;
	        case "^": value = padding.slice(0, length = padding.length >> 1) + valuePrefix + value + valueSuffix + padding.slice(length); break;
	        default: value = padding + valuePrefix + value + valueSuffix; break;
	      }

	      return numerals(value);
	    }

	    format.toString = function() {
	      return specifier + "";
	    };

	    return format;
	  }

	  function formatPrefix(specifier, value) {
	    var f = newFormat((specifier = formatSpecifier(specifier), specifier.type = "f", specifier)),
	        e = Math.max(-8, Math.min(8, Math.floor(exponent(value) / 3))) * 3,
	        k = Math.pow(10, -e),
	        prefix = prefixes[8 + e / 3];
	    return function(value) {
	      return f(k * value) + prefix;
	    };
	  }

	  return {
	    format: newFormat,
	    formatPrefix: formatPrefix
	  };
	}

	var locale;
	var format;
	var formatPrefix;

	defaultLocale({
	  decimal: ".",
	  thousands: ",",
	  grouping: [3],
	  currency: ["$", ""]
	});

	function defaultLocale(definition) {
	  locale = formatLocale(definition);
	  format = locale.format;
	  formatPrefix = locale.formatPrefix;
	  return locale;
	}

	function precisionFixed(step) {
	  return Math.max(0, -exponent(Math.abs(step)));
	}

	function precisionPrefix(step, value) {
	  return Math.max(0, Math.max(-8, Math.min(8, Math.floor(exponent(value) / 3))) * 3 - exponent(Math.abs(step)));
	}

	function precisionRound(step, max) {
	  step = Math.abs(step), max = Math.abs(max) - step;
	  return Math.max(0, exponent(max) - exponent(step)) + 1;
	}

	function tickFormat(start, stop, count, specifier) {
	  var step = tickStep(start, stop, count),
	      precision;
	  specifier = formatSpecifier(specifier == null ? ",f" : specifier);
	  switch (specifier.type) {
	    case "s": {
	      var value = Math.max(Math.abs(start), Math.abs(stop));
	      if (specifier.precision == null && !isNaN(precision = precisionPrefix(step, value))) specifier.precision = precision;
	      return formatPrefix(specifier, value);
	    }
	    case "":
	    case "e":
	    case "g":
	    case "p":
	    case "r": {
	      if (specifier.precision == null && !isNaN(precision = precisionRound(step, Math.max(Math.abs(start), Math.abs(stop))))) specifier.precision = precision - (specifier.type === "e");
	      break;
	    }
	    case "f":
	    case "%": {
	      if (specifier.precision == null && !isNaN(precision = precisionFixed(step))) specifier.precision = precision - (specifier.type === "%") * 2;
	      break;
	    }
	  }
	  return format(specifier);
	}

	function linearish(scale) {
	  var domain = scale.domain;

	  scale.ticks = function(count) {
	    var d = domain();
	    return ticks(d[0], d[d.length - 1], count == null ? 10 : count);
	  };

	  scale.tickFormat = function(count, specifier) {
	    var d = domain();
	    return tickFormat(d[0], d[d.length - 1], count == null ? 10 : count, specifier);
	  };

	  scale.nice = function(count) {
	    if (count == null) count = 10;

	    var d = domain(),
	        i0 = 0,
	        i1 = d.length - 1,
	        start = d[i0],
	        stop = d[i1],
	        step;

	    if (stop < start) {
	      step = start, start = stop, stop = step;
	      step = i0, i0 = i1, i1 = step;
	    }

	    step = tickIncrement(start, stop, count);

	    if (step > 0) {
	      start = Math.floor(start / step) * step;
	      stop = Math.ceil(stop / step) * step;
	      step = tickIncrement(start, stop, count);
	    } else if (step < 0) {
	      start = Math.ceil(start * step) / step;
	      stop = Math.floor(stop * step) / step;
	      step = tickIncrement(start, stop, count);
	    }

	    if (step > 0) {
	      d[i0] = Math.floor(start / step) * step;
	      d[i1] = Math.ceil(stop / step) * step;
	      domain(d);
	    } else if (step < 0) {
	      d[i0] = Math.ceil(start * step) / step;
	      d[i1] = Math.floor(stop * step) / step;
	      domain(d);
	    }

	    return scale;
	  };

	  return scale;
	}

	function linear$1() {
	  var scale = continuous(identity, identity);

	  scale.copy = function() {
	    return copy(scale, linear$1());
	  };

	  initRange.apply(scale, arguments);

	  return linearish(scale);
	}

	function transformPow(exponent) {
	  return function(x) {
	    return x < 0 ? -Math.pow(-x, exponent) : Math.pow(x, exponent);
	  };
	}

	function transformSqrt(x) {
	  return x < 0 ? -Math.sqrt(-x) : Math.sqrt(x);
	}

	function transformSquare(x) {
	  return x < 0 ? -x * x : x * x;
	}

	function powish(transform) {
	  var scale = transform(identity, identity),
	      exponent = 1;

	  function rescale() {
	    return exponent === 1 ? transform(identity, identity)
	        : exponent === 0.5 ? transform(transformSqrt, transformSquare)
	        : transform(transformPow(exponent), transformPow(1 / exponent));
	  }

	  scale.exponent = function(_) {
	    return arguments.length ? (exponent = +_, rescale()) : exponent;
	  };

	  return linearish(scale);
	}

	function pow() {
	  var scale = powish(transformer());

	  scale.copy = function() {
	    return copy(scale, pow()).exponent(scale.exponent());
	  };

	  initRange.apply(scale, arguments);

	  return scale;
	}

	function sqrt() {
	  return pow.apply(null, arguments).exponent(0.5);
	}

	var t0$1 = new Date,
	    t1$1 = new Date;

	function newInterval(floori, offseti, count, field) {

	  function interval(date) {
	    return floori(date = new Date(+date)), date;
	  }

	  interval.floor = interval;

	  interval.ceil = function(date) {
	    return floori(date = new Date(date - 1)), offseti(date, 1), floori(date), date;
	  };

	  interval.round = function(date) {
	    var d0 = interval(date),
	        d1 = interval.ceil(date);
	    return date - d0 < d1 - date ? d0 : d1;
	  };

	  interval.offset = function(date, step) {
	    return offseti(date = new Date(+date), step == null ? 1 : Math.floor(step)), date;
	  };

	  interval.range = function(start, stop, step) {
	    var range = [], previous;
	    start = interval.ceil(start);
	    step = step == null ? 1 : Math.floor(step);
	    if (!(start < stop) || !(step > 0)) return range; // also handles Invalid Date
	    do range.push(previous = new Date(+start)), offseti(start, step), floori(start);
	    while (previous < start && start < stop);
	    return range;
	  };

	  interval.filter = function(test) {
	    return newInterval(function(date) {
	      if (date >= date) while (floori(date), !test(date)) date.setTime(date - 1);
	    }, function(date, step) {
	      if (date >= date) {
	        if (step < 0) while (++step <= 0) {
	          while (offseti(date, -1), !test(date)) {} // eslint-disable-line no-empty
	        } else while (--step >= 0) {
	          while (offseti(date, +1), !test(date)) {} // eslint-disable-line no-empty
	        }
	      }
	    });
	  };

	  if (count) {
	    interval.count = function(start, end) {
	      t0$1.setTime(+start), t1$1.setTime(+end);
	      floori(t0$1), floori(t1$1);
	      return Math.floor(count(t0$1, t1$1));
	    };

	    interval.every = function(step) {
	      step = Math.floor(step);
	      return !isFinite(step) || !(step > 0) ? null
	          : !(step > 1) ? interval
	          : interval.filter(field
	              ? function(d) { return field(d) % step === 0; }
	              : function(d) { return interval.count(0, d) % step === 0; });
	    };
	  }

	  return interval;
	}

	var millisecond = newInterval(function() {
	  // noop
	}, function(date, step) {
	  date.setTime(+date + step);
	}, function(start, end) {
	  return end - start;
	});

	// An optimized implementation for this simple case.
	millisecond.every = function(k) {
	  k = Math.floor(k);
	  if (!isFinite(k) || !(k > 0)) return null;
	  if (!(k > 1)) return millisecond;
	  return newInterval(function(date) {
	    date.setTime(Math.floor(date / k) * k);
	  }, function(date, step) {
	    date.setTime(+date + step * k);
	  }, function(start, end) {
	    return (end - start) / k;
	  });
	};

	var durationSecond = 1e3;
	var durationMinute = 6e4;
	var durationHour = 36e5;
	var durationDay = 864e5;
	var durationWeek = 6048e5;

	var second = newInterval(function(date) {
	  date.setTime(date - date.getMilliseconds());
	}, function(date, step) {
	  date.setTime(+date + step * durationSecond);
	}, function(start, end) {
	  return (end - start) / durationSecond;
	}, function(date) {
	  return date.getUTCSeconds();
	});

	var minute = newInterval(function(date) {
	  date.setTime(date - date.getMilliseconds() - date.getSeconds() * durationSecond);
	}, function(date, step) {
	  date.setTime(+date + step * durationMinute);
	}, function(start, end) {
	  return (end - start) / durationMinute;
	}, function(date) {
	  return date.getMinutes();
	});

	var hour = newInterval(function(date) {
	  date.setTime(date - date.getMilliseconds() - date.getSeconds() * durationSecond - date.getMinutes() * durationMinute);
	}, function(date, step) {
	  date.setTime(+date + step * durationHour);
	}, function(start, end) {
	  return (end - start) / durationHour;
	}, function(date) {
	  return date.getHours();
	});

	var day = newInterval(function(date) {
	  date.setHours(0, 0, 0, 0);
	}, function(date, step) {
	  date.setDate(date.getDate() + step);
	}, function(start, end) {
	  return (end - start - (end.getTimezoneOffset() - start.getTimezoneOffset()) * durationMinute) / durationDay;
	}, function(date) {
	  return date.getDate() - 1;
	});

	function weekday(i) {
	  return newInterval(function(date) {
	    date.setDate(date.getDate() - (date.getDay() + 7 - i) % 7);
	    date.setHours(0, 0, 0, 0);
	  }, function(date, step) {
	    date.setDate(date.getDate() + step * 7);
	  }, function(start, end) {
	    return (end - start - (end.getTimezoneOffset() - start.getTimezoneOffset()) * durationMinute) / durationWeek;
	  });
	}

	var sunday = weekday(0);
	var monday = weekday(1);
	var tuesday = weekday(2);
	var wednesday = weekday(3);
	var thursday = weekday(4);
	var friday = weekday(5);
	var saturday = weekday(6);

	var month = newInterval(function(date) {
	  date.setDate(1);
	  date.setHours(0, 0, 0, 0);
	}, function(date, step) {
	  date.setMonth(date.getMonth() + step);
	}, function(start, end) {
	  return end.getMonth() - start.getMonth() + (end.getFullYear() - start.getFullYear()) * 12;
	}, function(date) {
	  return date.getMonth();
	});

	var year = newInterval(function(date) {
	  date.setMonth(0, 1);
	  date.setHours(0, 0, 0, 0);
	}, function(date, step) {
	  date.setFullYear(date.getFullYear() + step);
	}, function(start, end) {
	  return end.getFullYear() - start.getFullYear();
	}, function(date) {
	  return date.getFullYear();
	});

	// An optimized implementation for this simple case.
	year.every = function(k) {
	  return !isFinite(k = Math.floor(k)) || !(k > 0) ? null : newInterval(function(date) {
	    date.setFullYear(Math.floor(date.getFullYear() / k) * k);
	    date.setMonth(0, 1);
	    date.setHours(0, 0, 0, 0);
	  }, function(date, step) {
	    date.setFullYear(date.getFullYear() + step * k);
	  });
	};

	var utcMinute = newInterval(function(date) {
	  date.setUTCSeconds(0, 0);
	}, function(date, step) {
	  date.setTime(+date + step * durationMinute);
	}, function(start, end) {
	  return (end - start) / durationMinute;
	}, function(date) {
	  return date.getUTCMinutes();
	});

	var utcHour = newInterval(function(date) {
	  date.setUTCMinutes(0, 0, 0);
	}, function(date, step) {
	  date.setTime(+date + step * durationHour);
	}, function(start, end) {
	  return (end - start) / durationHour;
	}, function(date) {
	  return date.getUTCHours();
	});

	var utcDay = newInterval(function(date) {
	  date.setUTCHours(0, 0, 0, 0);
	}, function(date, step) {
	  date.setUTCDate(date.getUTCDate() + step);
	}, function(start, end) {
	  return (end - start) / durationDay;
	}, function(date) {
	  return date.getUTCDate() - 1;
	});

	function utcWeekday(i) {
	  return newInterval(function(date) {
	    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 7 - i) % 7);
	    date.setUTCHours(0, 0, 0, 0);
	  }, function(date, step) {
	    date.setUTCDate(date.getUTCDate() + step * 7);
	  }, function(start, end) {
	    return (end - start) / durationWeek;
	  });
	}

	var utcSunday = utcWeekday(0);
	var utcMonday = utcWeekday(1);
	var utcTuesday = utcWeekday(2);
	var utcWednesday = utcWeekday(3);
	var utcThursday = utcWeekday(4);
	var utcFriday = utcWeekday(5);
	var utcSaturday = utcWeekday(6);

	var utcMonth = newInterval(function(date) {
	  date.setUTCDate(1);
	  date.setUTCHours(0, 0, 0, 0);
	}, function(date, step) {
	  date.setUTCMonth(date.getUTCMonth() + step);
	}, function(start, end) {
	  return end.getUTCMonth() - start.getUTCMonth() + (end.getUTCFullYear() - start.getUTCFullYear()) * 12;
	}, function(date) {
	  return date.getUTCMonth();
	});

	var utcYear = newInterval(function(date) {
	  date.setUTCMonth(0, 1);
	  date.setUTCHours(0, 0, 0, 0);
	}, function(date, step) {
	  date.setUTCFullYear(date.getUTCFullYear() + step);
	}, function(start, end) {
	  return end.getUTCFullYear() - start.getUTCFullYear();
	}, function(date) {
	  return date.getUTCFullYear();
	});

	// An optimized implementation for this simple case.
	utcYear.every = function(k) {
	  return !isFinite(k = Math.floor(k)) || !(k > 0) ? null : newInterval(function(date) {
	    date.setUTCFullYear(Math.floor(date.getUTCFullYear() / k) * k);
	    date.setUTCMonth(0, 1);
	    date.setUTCHours(0, 0, 0, 0);
	  }, function(date, step) {
	    date.setUTCFullYear(date.getUTCFullYear() + step * k);
	  });
	};

	function localDate(d) {
	  if (0 <= d.y && d.y < 100) {
	    var date = new Date(-1, d.m, d.d, d.H, d.M, d.S, d.L);
	    date.setFullYear(d.y);
	    return date;
	  }
	  return new Date(d.y, d.m, d.d, d.H, d.M, d.S, d.L);
	}

	function utcDate(d) {
	  if (0 <= d.y && d.y < 100) {
	    var date = new Date(Date.UTC(-1, d.m, d.d, d.H, d.M, d.S, d.L));
	    date.setUTCFullYear(d.y);
	    return date;
	  }
	  return new Date(Date.UTC(d.y, d.m, d.d, d.H, d.M, d.S, d.L));
	}

	function newYear(y) {
	  return {y: y, m: 0, d: 1, H: 0, M: 0, S: 0, L: 0};
	}

	function formatLocale$1(locale) {
	  var locale_dateTime = locale.dateTime,
	      locale_date = locale.date,
	      locale_time = locale.time,
	      locale_periods = locale.periods,
	      locale_weekdays = locale.days,
	      locale_shortWeekdays = locale.shortDays,
	      locale_months = locale.months,
	      locale_shortMonths = locale.shortMonths;

	  var periodRe = formatRe(locale_periods),
	      periodLookup = formatLookup(locale_periods),
	      weekdayRe = formatRe(locale_weekdays),
	      weekdayLookup = formatLookup(locale_weekdays),
	      shortWeekdayRe = formatRe(locale_shortWeekdays),
	      shortWeekdayLookup = formatLookup(locale_shortWeekdays),
	      monthRe = formatRe(locale_months),
	      monthLookup = formatLookup(locale_months),
	      shortMonthRe = formatRe(locale_shortMonths),
	      shortMonthLookup = formatLookup(locale_shortMonths);

	  var formats = {
	    "a": formatShortWeekday,
	    "A": formatWeekday,
	    "b": formatShortMonth,
	    "B": formatMonth,
	    "c": null,
	    "d": formatDayOfMonth,
	    "e": formatDayOfMonth,
	    "f": formatMicroseconds,
	    "H": formatHour24,
	    "I": formatHour12,
	    "j": formatDayOfYear,
	    "L": formatMilliseconds,
	    "m": formatMonthNumber,
	    "M": formatMinutes,
	    "p": formatPeriod,
	    "Q": formatUnixTimestamp,
	    "s": formatUnixTimestampSeconds,
	    "S": formatSeconds,
	    "u": formatWeekdayNumberMonday,
	    "U": formatWeekNumberSunday,
	    "V": formatWeekNumberISO,
	    "w": formatWeekdayNumberSunday,
	    "W": formatWeekNumberMonday,
	    "x": null,
	    "X": null,
	    "y": formatYear,
	    "Y": formatFullYear,
	    "Z": formatZone,
	    "%": formatLiteralPercent
	  };

	  var utcFormats = {
	    "a": formatUTCShortWeekday,
	    "A": formatUTCWeekday,
	    "b": formatUTCShortMonth,
	    "B": formatUTCMonth,
	    "c": null,
	    "d": formatUTCDayOfMonth,
	    "e": formatUTCDayOfMonth,
	    "f": formatUTCMicroseconds,
	    "H": formatUTCHour24,
	    "I": formatUTCHour12,
	    "j": formatUTCDayOfYear,
	    "L": formatUTCMilliseconds,
	    "m": formatUTCMonthNumber,
	    "M": formatUTCMinutes,
	    "p": formatUTCPeriod,
	    "Q": formatUnixTimestamp,
	    "s": formatUnixTimestampSeconds,
	    "S": formatUTCSeconds,
	    "u": formatUTCWeekdayNumberMonday,
	    "U": formatUTCWeekNumberSunday,
	    "V": formatUTCWeekNumberISO,
	    "w": formatUTCWeekdayNumberSunday,
	    "W": formatUTCWeekNumberMonday,
	    "x": null,
	    "X": null,
	    "y": formatUTCYear,
	    "Y": formatUTCFullYear,
	    "Z": formatUTCZone,
	    "%": formatLiteralPercent
	  };

	  var parses = {
	    "a": parseShortWeekday,
	    "A": parseWeekday,
	    "b": parseShortMonth,
	    "B": parseMonth,
	    "c": parseLocaleDateTime,
	    "d": parseDayOfMonth,
	    "e": parseDayOfMonth,
	    "f": parseMicroseconds,
	    "H": parseHour24,
	    "I": parseHour24,
	    "j": parseDayOfYear,
	    "L": parseMilliseconds,
	    "m": parseMonthNumber,
	    "M": parseMinutes,
	    "p": parsePeriod,
	    "Q": parseUnixTimestamp,
	    "s": parseUnixTimestampSeconds,
	    "S": parseSeconds,
	    "u": parseWeekdayNumberMonday,
	    "U": parseWeekNumberSunday,
	    "V": parseWeekNumberISO,
	    "w": parseWeekdayNumberSunday,
	    "W": parseWeekNumberMonday,
	    "x": parseLocaleDate,
	    "X": parseLocaleTime,
	    "y": parseYear,
	    "Y": parseFullYear,
	    "Z": parseZone,
	    "%": parseLiteralPercent
	  };

	  // These recursive directive definitions must be deferred.
	  formats.x = newFormat(locale_date, formats);
	  formats.X = newFormat(locale_time, formats);
	  formats.c = newFormat(locale_dateTime, formats);
	  utcFormats.x = newFormat(locale_date, utcFormats);
	  utcFormats.X = newFormat(locale_time, utcFormats);
	  utcFormats.c = newFormat(locale_dateTime, utcFormats);

	  function newFormat(specifier, formats) {
	    return function(date) {
	      var string = [],
	          i = -1,
	          j = 0,
	          n = specifier.length,
	          c,
	          pad,
	          format;

	      if (!(date instanceof Date)) date = new Date(+date);

	      while (++i < n) {
	        if (specifier.charCodeAt(i) === 37) {
	          string.push(specifier.slice(j, i));
	          if ((pad = pads[c = specifier.charAt(++i)]) != null) c = specifier.charAt(++i);
	          else pad = c === "e" ? " " : "0";
	          if (format = formats[c]) c = format(date, pad);
	          string.push(c);
	          j = i + 1;
	        }
	      }

	      string.push(specifier.slice(j, i));
	      return string.join("");
	    };
	  }

	  function newParse(specifier, newDate) {
	    return function(string) {
	      var d = newYear(1900),
	          i = parseSpecifier(d, specifier, string += "", 0),
	          week, day$1;
	      if (i != string.length) return null;

	      // If a UNIX timestamp is specified, return it.
	      if ("Q" in d) return new Date(d.Q);

	      // The am-pm flag is 0 for AM, and 1 for PM.
	      if ("p" in d) d.H = d.H % 12 + d.p * 12;

	      // Convert day-of-week and week-of-year to day-of-year.
	      if ("V" in d) {
	        if (d.V < 1 || d.V > 53) return null;
	        if (!("w" in d)) d.w = 1;
	        if ("Z" in d) {
	          week = utcDate(newYear(d.y)), day$1 = week.getUTCDay();
	          week = day$1 > 4 || day$1 === 0 ? utcMonday.ceil(week) : utcMonday(week);
	          week = utcDay.offset(week, (d.V - 1) * 7);
	          d.y = week.getUTCFullYear();
	          d.m = week.getUTCMonth();
	          d.d = week.getUTCDate() + (d.w + 6) % 7;
	        } else {
	          week = newDate(newYear(d.y)), day$1 = week.getDay();
	          week = day$1 > 4 || day$1 === 0 ? monday.ceil(week) : monday(week);
	          week = day.offset(week, (d.V - 1) * 7);
	          d.y = week.getFullYear();
	          d.m = week.getMonth();
	          d.d = week.getDate() + (d.w + 6) % 7;
	        }
	      } else if ("W" in d || "U" in d) {
	        if (!("w" in d)) d.w = "u" in d ? d.u % 7 : "W" in d ? 1 : 0;
	        day$1 = "Z" in d ? utcDate(newYear(d.y)).getUTCDay() : newDate(newYear(d.y)).getDay();
	        d.m = 0;
	        d.d = "W" in d ? (d.w + 6) % 7 + d.W * 7 - (day$1 + 5) % 7 : d.w + d.U * 7 - (day$1 + 6) % 7;
	      }

	      // If a time zone is specified, all fields are interpreted as UTC and then
	      // offset according to the specified time zone.
	      if ("Z" in d) {
	        d.H += d.Z / 100 | 0;
	        d.M += d.Z % 100;
	        return utcDate(d);
	      }

	      // Otherwise, all fields are in local time.
	      return newDate(d);
	    };
	  }

	  function parseSpecifier(d, specifier, string, j) {
	    var i = 0,
	        n = specifier.length,
	        m = string.length,
	        c,
	        parse;

	    while (i < n) {
	      if (j >= m) return -1;
	      c = specifier.charCodeAt(i++);
	      if (c === 37) {
	        c = specifier.charAt(i++);
	        parse = parses[c in pads ? specifier.charAt(i++) : c];
	        if (!parse || ((j = parse(d, string, j)) < 0)) return -1;
	      } else if (c != string.charCodeAt(j++)) {
	        return -1;
	      }
	    }

	    return j;
	  }

	  function parsePeriod(d, string, i) {
	    var n = periodRe.exec(string.slice(i));
	    return n ? (d.p = periodLookup[n[0].toLowerCase()], i + n[0].length) : -1;
	  }

	  function parseShortWeekday(d, string, i) {
	    var n = shortWeekdayRe.exec(string.slice(i));
	    return n ? (d.w = shortWeekdayLookup[n[0].toLowerCase()], i + n[0].length) : -1;
	  }

	  function parseWeekday(d, string, i) {
	    var n = weekdayRe.exec(string.slice(i));
	    return n ? (d.w = weekdayLookup[n[0].toLowerCase()], i + n[0].length) : -1;
	  }

	  function parseShortMonth(d, string, i) {
	    var n = shortMonthRe.exec(string.slice(i));
	    return n ? (d.m = shortMonthLookup[n[0].toLowerCase()], i + n[0].length) : -1;
	  }

	  function parseMonth(d, string, i) {
	    var n = monthRe.exec(string.slice(i));
	    return n ? (d.m = monthLookup[n[0].toLowerCase()], i + n[0].length) : -1;
	  }

	  function parseLocaleDateTime(d, string, i) {
	    return parseSpecifier(d, locale_dateTime, string, i);
	  }

	  function parseLocaleDate(d, string, i) {
	    return parseSpecifier(d, locale_date, string, i);
	  }

	  function parseLocaleTime(d, string, i) {
	    return parseSpecifier(d, locale_time, string, i);
	  }

	  function formatShortWeekday(d) {
	    return locale_shortWeekdays[d.getDay()];
	  }

	  function formatWeekday(d) {
	    return locale_weekdays[d.getDay()];
	  }

	  function formatShortMonth(d) {
	    return locale_shortMonths[d.getMonth()];
	  }

	  function formatMonth(d) {
	    return locale_months[d.getMonth()];
	  }

	  function formatPeriod(d) {
	    return locale_periods[+(d.getHours() >= 12)];
	  }

	  function formatUTCShortWeekday(d) {
	    return locale_shortWeekdays[d.getUTCDay()];
	  }

	  function formatUTCWeekday(d) {
	    return locale_weekdays[d.getUTCDay()];
	  }

	  function formatUTCShortMonth(d) {
	    return locale_shortMonths[d.getUTCMonth()];
	  }

	  function formatUTCMonth(d) {
	    return locale_months[d.getUTCMonth()];
	  }

	  function formatUTCPeriod(d) {
	    return locale_periods[+(d.getUTCHours() >= 12)];
	  }

	  return {
	    format: function(specifier) {
	      var f = newFormat(specifier += "", formats);
	      f.toString = function() { return specifier; };
	      return f;
	    },
	    parse: function(specifier) {
	      var p = newParse(specifier += "", localDate);
	      p.toString = function() { return specifier; };
	      return p;
	    },
	    utcFormat: function(specifier) {
	      var f = newFormat(specifier += "", utcFormats);
	      f.toString = function() { return specifier; };
	      return f;
	    },
	    utcParse: function(specifier) {
	      var p = newParse(specifier, utcDate);
	      p.toString = function() { return specifier; };
	      return p;
	    }
	  };
	}

	var pads = {"-": "", "_": " ", "0": "0"},
	    numberRe = /^\s*\d+/, // note: ignores next directive
	    percentRe = /^%/,
	    requoteRe = /[\\^$*+?|[\]().{}]/g;

	function pad(value, fill, width) {
	  var sign = value < 0 ? "-" : "",
	      string = (sign ? -value : value) + "",
	      length = string.length;
	  return sign + (length < width ? new Array(width - length + 1).join(fill) + string : string);
	}

	function requote(s) {
	  return s.replace(requoteRe, "\\$&");
	}

	function formatRe(names) {
	  return new RegExp("^(?:" + names.map(requote).join("|") + ")", "i");
	}

	function formatLookup(names) {
	  var map = {}, i = -1, n = names.length;
	  while (++i < n) map[names[i].toLowerCase()] = i;
	  return map;
	}

	function parseWeekdayNumberSunday(d, string, i) {
	  var n = numberRe.exec(string.slice(i, i + 1));
	  return n ? (d.w = +n[0], i + n[0].length) : -1;
	}

	function parseWeekdayNumberMonday(d, string, i) {
	  var n = numberRe.exec(string.slice(i, i + 1));
	  return n ? (d.u = +n[0], i + n[0].length) : -1;
	}

	function parseWeekNumberSunday(d, string, i) {
	  var n = numberRe.exec(string.slice(i, i + 2));
	  return n ? (d.U = +n[0], i + n[0].length) : -1;
	}

	function parseWeekNumberISO(d, string, i) {
	  var n = numberRe.exec(string.slice(i, i + 2));
	  return n ? (d.V = +n[0], i + n[0].length) : -1;
	}

	function parseWeekNumberMonday(d, string, i) {
	  var n = numberRe.exec(string.slice(i, i + 2));
	  return n ? (d.W = +n[0], i + n[0].length) : -1;
	}

	function parseFullYear(d, string, i) {
	  var n = numberRe.exec(string.slice(i, i + 4));
	  return n ? (d.y = +n[0], i + n[0].length) : -1;
	}

	function parseYear(d, string, i) {
	  var n = numberRe.exec(string.slice(i, i + 2));
	  return n ? (d.y = +n[0] + (+n[0] > 68 ? 1900 : 2000), i + n[0].length) : -1;
	}

	function parseZone(d, string, i) {
	  var n = /^(Z)|([+-]\d\d)(?::?(\d\d))?/.exec(string.slice(i, i + 6));
	  return n ? (d.Z = n[1] ? 0 : -(n[2] + (n[3] || "00")), i + n[0].length) : -1;
	}

	function parseMonthNumber(d, string, i) {
	  var n = numberRe.exec(string.slice(i, i + 2));
	  return n ? (d.m = n[0] - 1, i + n[0].length) : -1;
	}

	function parseDayOfMonth(d, string, i) {
	  var n = numberRe.exec(string.slice(i, i + 2));
	  return n ? (d.d = +n[0], i + n[0].length) : -1;
	}

	function parseDayOfYear(d, string, i) {
	  var n = numberRe.exec(string.slice(i, i + 3));
	  return n ? (d.m = 0, d.d = +n[0], i + n[0].length) : -1;
	}

	function parseHour24(d, string, i) {
	  var n = numberRe.exec(string.slice(i, i + 2));
	  return n ? (d.H = +n[0], i + n[0].length) : -1;
	}

	function parseMinutes(d, string, i) {
	  var n = numberRe.exec(string.slice(i, i + 2));
	  return n ? (d.M = +n[0], i + n[0].length) : -1;
	}

	function parseSeconds(d, string, i) {
	  var n = numberRe.exec(string.slice(i, i + 2));
	  return n ? (d.S = +n[0], i + n[0].length) : -1;
	}

	function parseMilliseconds(d, string, i) {
	  var n = numberRe.exec(string.slice(i, i + 3));
	  return n ? (d.L = +n[0], i + n[0].length) : -1;
	}

	function parseMicroseconds(d, string, i) {
	  var n = numberRe.exec(string.slice(i, i + 6));
	  return n ? (d.L = Math.floor(n[0] / 1000), i + n[0].length) : -1;
	}

	function parseLiteralPercent(d, string, i) {
	  var n = percentRe.exec(string.slice(i, i + 1));
	  return n ? i + n[0].length : -1;
	}

	function parseUnixTimestamp(d, string, i) {
	  var n = numberRe.exec(string.slice(i));
	  return n ? (d.Q = +n[0], i + n[0].length) : -1;
	}

	function parseUnixTimestampSeconds(d, string, i) {
	  var n = numberRe.exec(string.slice(i));
	  return n ? (d.Q = (+n[0]) * 1000, i + n[0].length) : -1;
	}

	function formatDayOfMonth(d, p) {
	  return pad(d.getDate(), p, 2);
	}

	function formatHour24(d, p) {
	  return pad(d.getHours(), p, 2);
	}

	function formatHour12(d, p) {
	  return pad(d.getHours() % 12 || 12, p, 2);
	}

	function formatDayOfYear(d, p) {
	  return pad(1 + day.count(year(d), d), p, 3);
	}

	function formatMilliseconds(d, p) {
	  return pad(d.getMilliseconds(), p, 3);
	}

	function formatMicroseconds(d, p) {
	  return formatMilliseconds(d, p) + "000";
	}

	function formatMonthNumber(d, p) {
	  return pad(d.getMonth() + 1, p, 2);
	}

	function formatMinutes(d, p) {
	  return pad(d.getMinutes(), p, 2);
	}

	function formatSeconds(d, p) {
	  return pad(d.getSeconds(), p, 2);
	}

	function formatWeekdayNumberMonday(d) {
	  var day = d.getDay();
	  return day === 0 ? 7 : day;
	}

	function formatWeekNumberSunday(d, p) {
	  return pad(sunday.count(year(d), d), p, 2);
	}

	function formatWeekNumberISO(d, p) {
	  var day = d.getDay();
	  d = (day >= 4 || day === 0) ? thursday(d) : thursday.ceil(d);
	  return pad(thursday.count(year(d), d) + (year(d).getDay() === 4), p, 2);
	}

	function formatWeekdayNumberSunday(d) {
	  return d.getDay();
	}

	function formatWeekNumberMonday(d, p) {
	  return pad(monday.count(year(d), d), p, 2);
	}

	function formatYear(d, p) {
	  return pad(d.getFullYear() % 100, p, 2);
	}

	function formatFullYear(d, p) {
	  return pad(d.getFullYear() % 10000, p, 4);
	}

	function formatZone(d) {
	  var z = d.getTimezoneOffset();
	  return (z > 0 ? "-" : (z *= -1, "+"))
	      + pad(z / 60 | 0, "0", 2)
	      + pad(z % 60, "0", 2);
	}

	function formatUTCDayOfMonth(d, p) {
	  return pad(d.getUTCDate(), p, 2);
	}

	function formatUTCHour24(d, p) {
	  return pad(d.getUTCHours(), p, 2);
	}

	function formatUTCHour12(d, p) {
	  return pad(d.getUTCHours() % 12 || 12, p, 2);
	}

	function formatUTCDayOfYear(d, p) {
	  return pad(1 + utcDay.count(utcYear(d), d), p, 3);
	}

	function formatUTCMilliseconds(d, p) {
	  return pad(d.getUTCMilliseconds(), p, 3);
	}

	function formatUTCMicroseconds(d, p) {
	  return formatUTCMilliseconds(d, p) + "000";
	}

	function formatUTCMonthNumber(d, p) {
	  return pad(d.getUTCMonth() + 1, p, 2);
	}

	function formatUTCMinutes(d, p) {
	  return pad(d.getUTCMinutes(), p, 2);
	}

	function formatUTCSeconds(d, p) {
	  return pad(d.getUTCSeconds(), p, 2);
	}

	function formatUTCWeekdayNumberMonday(d) {
	  var dow = d.getUTCDay();
	  return dow === 0 ? 7 : dow;
	}

	function formatUTCWeekNumberSunday(d, p) {
	  return pad(utcSunday.count(utcYear(d), d), p, 2);
	}

	function formatUTCWeekNumberISO(d, p) {
	  var day = d.getUTCDay();
	  d = (day >= 4 || day === 0) ? utcThursday(d) : utcThursday.ceil(d);
	  return pad(utcThursday.count(utcYear(d), d) + (utcYear(d).getUTCDay() === 4), p, 2);
	}

	function formatUTCWeekdayNumberSunday(d) {
	  return d.getUTCDay();
	}

	function formatUTCWeekNumberMonday(d, p) {
	  return pad(utcMonday.count(utcYear(d), d), p, 2);
	}

	function formatUTCYear(d, p) {
	  return pad(d.getUTCFullYear() % 100, p, 2);
	}

	function formatUTCFullYear(d, p) {
	  return pad(d.getUTCFullYear() % 10000, p, 4);
	}

	function formatUTCZone() {
	  return "+0000";
	}

	function formatLiteralPercent() {
	  return "%";
	}

	function formatUnixTimestamp(d) {
	  return +d;
	}

	function formatUnixTimestampSeconds(d) {
	  return Math.floor(+d / 1000);
	}

	var locale$1;
	var timeFormat;
	var timeParse;
	var utcFormat;
	var utcParse;

	defaultLocale$1({
	  dateTime: "%x, %X",
	  date: "%-m/%-d/%Y",
	  time: "%-I:%M:%S %p",
	  periods: ["AM", "PM"],
	  days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
	  shortDays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
	  months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
	  shortMonths: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
	});

	function defaultLocale$1(definition) {
	  locale$1 = formatLocale$1(definition);
	  timeFormat = locale$1.format;
	  timeParse = locale$1.parse;
	  utcFormat = locale$1.utcFormat;
	  utcParse = locale$1.utcParse;
	  return locale$1;
	}

	var isoSpecifier = "%Y-%m-%dT%H:%M:%S.%LZ";

	function formatIsoNative(date) {
	  return date.toISOString();
	}

	var formatIso = Date.prototype.toISOString
	    ? formatIsoNative
	    : utcFormat(isoSpecifier);

	function parseIsoNative(string) {
	  var date = new Date(string);
	  return isNaN(date) ? null : date;
	}

	var parseIso = +new Date("2000-01-01T00:00:00.000Z")
	    ? parseIsoNative
	    : utcParse(isoSpecifier);

	var defaultScales = {
		x: linear$1,
		y: linear$1,
		r: sqrt
	};

	const getRange = {
		x: (settings, width, height) => settings.reverseX ? [width, 0] : typeof settings.xRange === 'function' ? settings.xRange({ width, height }) : (settings.xRange || [0, width]),
		y: (settings, width, height) => settings.reverseY ? [height, 0] : typeof settings.yRange === 'function' ? settings.yRange({ width, height }) : (settings.yRange || [0, height]),
		r: (settings, width, height) => !settings.rRange ? [1, 25] : typeof settings.rRange === 'function' ? settings.rRange({ width, height }) : settings.rRange
	};

	function getDefaultRange (s, settings, width, height) {
		return getRange[s](settings, width, height);
	}

	/* --------------------------------------------
	 *
	 * Calculate the extents of desired fields
	 * Returns an object like `{x: [0, 10], y: [-10, 10]}` if `fields` is `[{field:'x', accessor: d => d.x}, {field:'y', accessor: d => d.y}]`
	 *
	 * --------------------------------------------
	 */
	function calcExtents (data, fields) {
		if (!Array.isArray(data) || data.length === 0) return null;
		const extents = {};
		const fl = fields.length;
		let i;
		let j;
		let f;
		let val;
		let s;

		if (fl) {
			for (i = 0; i < fl; i++) {
				const firstRow = fields[i].accessor(data[0]);
				extents[fields[i].field] = Array.isArray(firstRow) ? firstRow : [firstRow, firstRow];
			}
			const dl = data.length;
			for (i = 0; i < dl; i++) {
				for (j = 0; j < fl; j++) {
					f = fields[j];
					val = f.accessor(data[i]);
					s = f.field;
					if (Array.isArray(val)) {
						const vl = val.length;
						for (let k = 0; k < vl; k++) {
							if (val[k] !== undefined) {
								if (val[k] < extents[s][0]) {
									extents[s][0] = val[k];
								}
								if (val[k] > extents[s][1]) {
									extents[s][1] = val[k];
								}
							}
						}
					} else if (val !== undefined) {
						if (val < extents[s][0]) {
							extents[s][0] = val;
						}
						if (val > extents[s][1]) {
							extents[s][1] = val;
						}
					}
				}
			}
		} else {
			return null;
		}
		return extents;
	}

	/* --------------------------------------------
	 *
	 * Return a truthy value if is zero
	 *
	 * --------------------------------------------
	 */
	function canBeZero (val) {
		if (val === 0) {
			return true;
		}
		return val;
	}

	/* --------------------------------------------
	 * Get a list of every key we've declared in config
	 */
	function getActiveKeys (config) {
		return ['x', 'y', 'r'].filter(s => {
			return canBeZero(config[s]);
		});
	}

	/* --------------------------------------------
	 * If we have a domain from settings, fill in
	 * any null values with ones from our measured extents
	 * otherwise, return the measured extent
	 */
	function partialDomain (doughmain, directive) {
		if (Array.isArray(directive) === true) {
			return directive.map((d, i) => {
				if (d === null) {
					return doughmain[i];
				}
				return d;
			});
		} else {
			return doughmain;
		}
	}

	function makeAccessor (acc) {
		if (!canBeZero(acc)) return null;
		if (Array.isArray(acc)) {
			return d => acc.map(k => typeof k !== 'function' ? d[k] : k(d));
		} else if (typeof acc !== 'function') {
			return d => d[acc];
		} else {
			return acc;
		}
	}

	/* --------------------------------------------
	 *
	 * Returns a modified scale domain by in/decreasing
	 * the min/max by taking the desired difference
	 * in pixels and converting it to units of data.
	 * Returns an array that you can set as the new domain.
	 *
	 * --------------------------------------------
	 */
	function padScale(scale, padding) {
	    const doughmain = scale.domain();
	    if (!Array.isArray(padding) || typeof scale.invert !== 'function') {
	        return doughmain.slice();
	    }

	    const paddedDomain = doughmain.slice();
	    const pl = padding.length;
	    for (let i = 0; i < pl; i++) {
	        const sign = i === 0 ? -1 : 1;
	        const isTime = Object.prototype.toString.call(doughmain[i]) === '[object Date]';

	        const parts = [doughmain[i], scale.invert(padding[i]), scale.invert(0)].map(d => {
	            return isTime ? d.getTime() : d;
	        });
	        paddedDomain[i] = [parts[0] + Math.abs(parts[1] - parts[2]) * sign].map(d => {
	            return isTime ? new Date(d) : d;
	        })[0];
	    }
	    return paddedDomain;
	}

	/* --------------------------------------------
	 * Main class
	 */
	class LayerCakeStore extends Store {
		constructor (config) {
			/* --------------------------------------------
			 * Set border box so padding works correctly
			 */
			config.target.style['box-sizing'] = 'border-box';

			/* --------------------------------------------
			 * Main values
			 */
			const coreValues = {
				data: config.data,
				containerWidth: config.target.clientWidth,
				containerHeight: config.target.clientHeight,
				layouts: [],
				target: config.target,
				custom: config.custom || {}
			};

			/* --------------------------------------------
			 * Values that computed properties are based on and that
			 * can be easily extended from config values
			 */
			const settings = Object.assign({
				activeKeys: getActiveKeys(config),
				activeGetters: [],
				xDomain: null,
				yDomain: null,
				rDomain: null,
				xNice: null,
				yNice: null,
				rNice: null,
				reverseX: false,
				reverseY: true,
				xPadding: null,
				yPadding: null,
				rPadding: null,
				xScale: null,
				yScale: null,
				rScale: null,
				rRange: null
			}, config);

			/* --------------------------------------------
			 * Preserve a copy of our passed in settings before we modify them
			 * Return this to the user's store so they can reference things if need be
			 * This is mostly an escape-hatch
			 */
			const originalSettings = Object.assign({}, settings);

			/* --------------------------------------------
			 * Make accessors for every active key
			 */
			settings.activeKeys.forEach(s => {
				settings[s] = makeAccessor(config[s]);
				settings.activeGetters.push({ dimension: s, get: settings[s] });
			});

			if (settings.data) {
				settings.flatData = settings.flatData || settings.data;
				settings.domains = calcExtents(settings.flatData, settings.activeKeys.map(key => {
					return {
						field: key,
						accessor: settings[key]
					};
				}));

				settings.activeKeys.forEach(s => {
					const thisDomain = `${s}Domain`;
					settings[thisDomain] = partialDomain(settings.domains[s], originalSettings[thisDomain]);
				});
			}

			/* --------------------------------------------
			 * We're going to add everything in settings and config onto our store
			 * except for a few that are computed down below, so omit this from what gets
			 * sent to super
			 */
			const computedValues = [
				...settings.activeKeys.map(s => `${s}Scale`),
				'rRange'
			];

			/* --------------------------------------------
			 * Assign these values to the store
			 */
			super(Object.assign(omit(settings, computedValues), coreValues, { originalSettings }));

			/* --------------------------------------------
			 * Use some of the settings to determine our computed values
			 */
			this.computeValues(settings, originalSettings);
		}

		computeValues (settings, originalSettings) {
			this.compute('padding', ['target', 'containerWidth', 'containerHeight'], target => {
				const defaultPadding = {top: 0, right: 0, bottom: 0, left: 0};
				let hasPadding = false;
				const padding = {};

				const styles = window.getComputedStyle(target);
				Object.keys(defaultPadding).forEach(p => {
					const val = +styles.getPropertyValue(`padding-${p}`).replace('px', '') || 0;
					padding[p] = val;
					if (val) hasPadding = true;
				});
				if (hasPadding === true) {
					return padding;
				} else {
					return Object.assign(defaultPadding, settings.padding || {});
				}
			});

			this.compute('box', ['containerWidth', 'containerHeight', 'padding'], (containerWidth, containerHeight, padding) => {
				const b = {};
				b.top = padding.top;
				b.right = containerWidth - padding.right;
				b.bottom = containerHeight - padding.bottom;
				b.left = padding.left;
				b.width = b.right - b.left;
				b.height = b.bottom - b.top;
				return b;
			});

			this.compute('width', ['box'], (box) => {
				return box.width;
			});

			this.compute('height', ['box'], (box) => {
				return box.height;
			});

			if (settings.data) {
				/* --------------------------------------------
				 * Update the domain if the data has changed after we initialize
				 * Domain is not a computed property since we want to be able to set it sometimes
				 * but if the data changes, it should be recomputed
				 */
				this.on('state', ({ changed, current }) => {
					if (changed.data || changed.flatData) {
						const newSettings = {};
						newSettings.flatData = changed.flatData ? current.flatData : current.data;
						newSettings.domains = calcExtents(newSettings.flatData, current.activeKeys.map(key => {
							return {
								field: key,
								accessor: settings[key]
							};
						}));

						settings.activeKeys.forEach(s => {
							const thisDomain = `${s}Domain`;
							newSettings[thisDomain] = partialDomain(newSettings.domains[s], originalSettings[thisDomain]);
						});
						this.set(newSettings);
					}
				});

				/* --------------------------------------------
				 * Compute every domain and scale for which we have an accessor
				 */
				settings.activeKeys.forEach(s => {
					const thisScale = `${s}Scale`;
					this.compute(thisScale, ['width', 'height', 'domains', `${s}Domain`], (width, height, domains, thisDoughmain) => {
						if (domains === null) {
							return null;
						}

						const defaultRange = getDefaultRange(s, settings, width, height);

						const scale = settings[thisScale] ? settings[thisScale].copy() : defaultScales[s]();

						scale
							.domain(partialDomain(domains[s], thisDoughmain)) // on creation, `thisDoughmain` will already have any nulls filled in but if we set it via the store it might not, so rerun it through partialDomain
							.range(defaultRange);

						if (settings[`${s}Padding`]) {
							scale.domain(padScale(scale, settings[`${s}Padding`]));
						}

						if (settings[`${s}Nice`] === true) {
							if (typeof scale.nice === 'function') {
								scale.nice();
							} else {
								console.error(`Layer Cake warning: You set \`${s}Nice: true\` but the ${s}Scale does not have a \`.nice\` method. Ignoring...`);
							}
						}

						return scale;
					});

					/* --------------------------------------------
					 * Compute a shorthand function to get the value and convert it using its scale
					 * exposed as `xGet`, `yGet` or `rGet`.
					 */
					const getter = `${s}Get`;
					this.compute(getter, [s, thisScale], (thisS, thisScale) => {
						return (d) => {
							const val = thisS(d);
							if (Array.isArray(val)) {
								return val.map(v => thisScale(v));
							}
							return thisScale(val);
						};
					});
				});
			}
		}

		render (opts = {}) {
			const { target, data } = this.get();
			const app = new LayerCakeContainer(Object.assign({}, opts, {
				target,
				data: { data },
				store: this
			}));

			return { app, store: this };
		}

		svgLayers (layers, opts = {}) {
			const { layouts } = this.get();
			layouts.push({ type: Svg, layers, opts });
			return this;
		}

		htmlLayers (layers, opts = {}) {
			const { layouts } = this.get();
			layouts.push({ type: Html, layers, opts });
			return this;
		}

		canvasLayers (layers, opts = {}) {
			const { layouts } = this.get();
			layouts.push({ type: Canvas, layers, opts });
			return this;
		}

		webglLayers (layers, opts = {}) {
			const { layouts } = this.get();
			layouts.push({ type: Webgl, layers, opts });
			return this;
		}
	}

	var points = [
	  {
	    myX: 1979,
	    myY: 7.19
	  },
	  {
	    myX: 1980,
	    myY: 7.83
	  },
	  {
	    myX: 1981,
	    myY: 7.24
	  },
	  {
	    myX: 1982,
	    myY: 7.44
	  },
	  {
	    myX: 1983,
	    myY: 7.51
	  },
	  {
	    myX: 1984,
	    myY: 7.1
	  },
	  {
	    myX: 1985,
	    myY: 6.91
	  },
	  {
	    myX: 1986,
	    myY: 7.53
	  },
	  {
	    myX: 1987,
	    myY: 7.47
	  },
	  {
	    myX: 1988,
	    myY: 7.48
	  },
	  {
	    myX: 1989,
	    myY: 7.03
	  },
	  {
	    myX: 1990,
	    myY: 6.23
	  },
	  {
	    myX: 1991,
	    myY: 6.54
	  },
	  {
	    myX: 1992,
	    myY: 7.54
	  },
	  {
	    myX: 1993,
	    myY: 6.5
	  },
	  {
	    myX: 1994,
	    myY: 7.18
	  },
	  {
	    myX: 1995,
	    myY: 6.12
	  },
	  {
	    myX: 1996,
	    myY: 7.87
	  },
	  {
	    myX: 1997,
	    myY: 6.73
	  },
	  {
	    myX: 1998,
	    myY: 6.55
	  },
	  {
	    myX: 1999,
	    myY: 6.23
	  },
	  {
	    myX: 2000,
	    myY: 6.31
	  },
	  {
	    myX: 2001,
	    myY: 6.74
	  },
	  {
	    myX: 2002,
	    myY: 5.95
	  },
	  {
	    myX: 2003,
	    myY: 6.13
	  },
	  {
	    myX: 2004,
	    myY: 6.04
	  },
	  {
	    myX: 2005,
	    myY: 5.56
	  },
	  {
	    myX: 2006,
	    myY: 5.91
	  },
	  {
	    myX: 2007,
	    myY: 4.29
	  },
	  {
	    myX: 2008,
	    myY: 4.72
	  },
	  {
	    myX: 2009,
	    myY: 5.38
	  },
	  {
	    myX: 2010,
	    myY: 4.92
	  },
	  {
	    myX: 2011,
	    myY: 4.61
	  },
	  {
	    myX: 2012,
	    myY: 3.62
	  },
	  {
	    myX: 2013,
	    myY: 5.35
	  },
	  {
	    myX: 2014,
	    myY: 5.28
	  },
	  {
	    myX: 2015,
	    myY: 4.63
	  },
	  {
	    myX: 2016,
	    myY: 4.72
	  }
	];

	/* layer-cake-example/layercake-Line/src/components/Line.html generated by Svelte v2.16.1 */

	function path({ $data, $xGet, $yGet }) {
	  return 'M' + $data
	    .map((d, i) => {
	      return $xGet(d) + ',' + $yGet(d);
	    })
	    .join('L');
	}

	function add_css$5() {
		var style = createElement("style");
		style.id = 'svelte-2olc8f-style';
		style.textContent = ".path-line.svelte-2olc8f{fill:none;stroke-linejoin:round;stroke-linecap:round;stroke-width:2}";
		append(document.head, style);
	}

	function create_main_fragment$5(component, ctx) {
		var path_1;

		return {
			c() {
				path_1 = createSvgElement("path");
				setAttribute(path_1, "class", "path-line svelte-2olc8f");
				setAttribute(path_1, "d", ctx.path);
				setStyle(path_1, "stroke", (ctx.opts.stroke || '#ab00d6'));
			},

			m(target, anchor) {
				insert(target, path_1, anchor);
			},

			p(changed, ctx) {
				if (changed.path) {
					setAttribute(path_1, "d", ctx.path);
				}

				if (changed.opts) {
					setStyle(path_1, "stroke", (ctx.opts.stroke || '#ab00d6'));
				}
			},

			d(detach) {
				if (detach) {
					detachNode(path_1);
				}
			}
		};
	}

	function Line(options) {
		init(this, options);
		this._state = assign(this.store._init(["data","xGet","yGet"]), options.data);
		this.store._add(this, ["data","xGet","yGet"]);

		this._recompute({ $data: 1, $xGet: 1, $yGet: 1 }, this._state);
		this._intro = true;

		this._handlers.destroy = [removeFromStore];

		if (!document.getElementById("svelte-2olc8f-style")) add_css$5();

		this._fragment = create_main_fragment$5(this, this._state);

		if (options.target) {
			this._fragment.c();
			this._mount(options.target, options.anchor);
		}
	}

	assign(Line.prototype, proto);

	Line.prototype._recompute = function _recompute(changed, state) {
		if (changed.$data || changed.$xGet || changed.$yGet) {
			if (this._differs(state.path, (state.path = path(state)))) changed.path = true;
		}
	};

	/* layer-cake-example/layercake-Line/src/components/Area.html generated by Svelte v2.16.1 */

	function area({ $xScale, $domains, $yScale, path }) {
	  const yRange = $yScale.range();
	  return path + (
	    'L' + $xScale($domains.x[1]) + ',' + yRange[0] +
	    'L' + $xScale($domains.x[0]) + ',' + yRange[0] +
	    'Z'
	  );
	}

	function path$1({ $data, $xGet, $yGet }) {
	  return 'M' + $data
	    .map(function (d, i) {
	      return $xGet(d) + ',' + $yGet(d);
	    })
	    .join('L');
	}

	function add_css$6() {
		var style = createElement("style");
		style.id = 'svelte-1el51kl-style';
		style.textContent = ".path-area.svelte-1el51kl{fill:#ab00d610}";
		append(document.head, style);
	}

	function create_main_fragment$6(component, ctx) {
		var path_1;

		return {
			c() {
				path_1 = createSvgElement("path");
				setAttribute(path_1, "class", "path-area svelte-1el51kl");
				setAttribute(path_1, "d", ctx.area);
			},

			m(target, anchor) {
				insert(target, path_1, anchor);
			},

			p(changed, ctx) {
				if (changed.area) {
					setAttribute(path_1, "d", ctx.area);
				}
			},

			d(detach) {
				if (detach) {
					detachNode(path_1);
				}
			}
		};
	}

	function Area(options) {
		init(this, options);
		this._state = assign(this.store._init(["xScale","domains","yScale","data","xGet","yGet"]), options.data);
		this.store._add(this, ["xScale","domains","yScale","data","xGet","yGet"]);

		this._recompute({ $data: 1, $xGet: 1, $yGet: 1, $xScale: 1, $domains: 1, $yScale: 1, path: 1 }, this._state);
		this._intro = true;

		this._handlers.destroy = [removeFromStore];

		if (!document.getElementById("svelte-1el51kl-style")) add_css$6();

		this._fragment = create_main_fragment$6(this, this._state);

		if (options.target) {
			this._fragment.c();
			this._mount(options.target, options.anchor);
		}
	}

	assign(Area.prototype, proto);

	Area.prototype._recompute = function _recompute(changed, state) {
		if (changed.$data || changed.$xGet || changed.$yGet) {
			if (this._differs(state.path, (state.path = path$1(state)))) changed.path = true;
		}

		if (changed.$xScale || changed.$domains || changed.$yScale || changed.path) {
			if (this._differs(state.area, (state.area = area(state)))) changed.area = true;
		}
	};

	/* layer-cake-example/layercake-Line/src/components/AxisX.html generated by Svelte v2.16.1 */

	function ticks$1({ $xScale, opts }) {
	  return opts.ticks || $xScale.ticks(opts.tickNumber);
	}

	function textAnchor({ ticks, opts }) {
	  return function (i) {
	    if (opts.snapTicks === true) {
	      if (i === 0) {
	        return 'start';
	      }
	      if (i === ticks.length - 1) {
	        return 'end';
	      }
	    }
	    return 'middle';
	  };
	}

	function add_css$7() {
		var style = createElement("style");
		style.id = 'svelte-1fce8tb-style';
		style.textContent = ".tick.svelte-1fce8tb{font-size:.725em;font-weight:200}line.svelte-1fce8tb,.tick.svelte-1fce8tb line.svelte-1fce8tb{stroke:#aaa;stroke-dasharray:2}.tick.svelte-1fce8tb text.svelte-1fce8tb{fill:#666}.baseline.svelte-1fce8tb{stroke-dasharray:0}";
		append(document.head, style);
	}

	function get_each_context$3(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.tick = list[i];
		child_ctx.i = i;
		return child_ctx;
	}

	function create_main_fragment$7(component, ctx) {
		var g, each_anchor;

		var each_value = ctx.ticks;

		var each_blocks = [];

		for (var i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block$3(component, get_each_context$3(ctx, each_value, i));
		}

		var if_block = (ctx.opts.baseline === true) && create_if_block$1(component, ctx);

		return {
			c() {
				g = createSvgElement("g");

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				each_anchor = createComment();
				if (if_block) if_block.c();
				setAttribute(g, "class", "axis x-axis");
			},

			m(target, anchor) {
				insert(target, g, anchor);

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].m(g, null);
				}

				append(g, each_anchor);
				if (if_block) if_block.m(g, null);
			},

			p(changed, ctx) {
				if (changed.ticks || changed.$xScale || changed.$yScale || changed.textAnchor || changed.opts || changed.$height) {
					each_value = ctx.ticks;

					for (var i = 0; i < each_value.length; i += 1) {
						const child_ctx = get_each_context$3(ctx, each_value, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
						} else {
							each_blocks[i] = create_each_block$3(component, child_ctx);
							each_blocks[i].c();
							each_blocks[i].m(g, each_anchor);
						}
					}

					for (; i < each_blocks.length; i += 1) {
						each_blocks[i].d(1);
					}
					each_blocks.length = each_value.length;
				}

				if (ctx.opts.baseline === true) {
					if (if_block) {
						if_block.p(changed, ctx);
					} else {
						if_block = create_if_block$1(component, ctx);
						if_block.c();
						if_block.m(g, null);
					}
				} else if (if_block) {
					if_block.d(1);
					if_block = null;
				}
			},

			d(detach) {
				if (detach) {
					detachNode(g);
				}

				destroyEach(each_blocks, detach);

				if (if_block) if_block.d();
			}
		};
	}

	// (4:6) {#if opts.gridlines !== false}
	function create_if_block_1(component, ctx) {
		var line, line_y__value;

		return {
			c() {
				line = createSvgElement("line");
				setAttribute(line, "y1", line_y__value = ctx.$height * -1);
				setAttribute(line, "y2", "0");
				setAttribute(line, "x1", "0");
				setAttribute(line, "x2", "0");
				setAttribute(line, "class", "svelte-1fce8tb");
			},

			m(target, anchor) {
				insert(target, line, anchor);
			},

			p(changed, ctx) {
				if ((changed.$height) && line_y__value !== (line_y__value = ctx.$height * -1)) {
					setAttribute(line, "y1", line_y__value);
				}
			},

			d(detach) {
				if (detach) {
					detachNode(line);
				}
			}
		};
	}

	// (2:2) {#each ticks as tick, i}
	function create_each_block$3(component, ctx) {
		var g, text1, text0_value = ctx.opts.formatTick ? ctx.opts.formatTick(ctx.tick) : ctx.tick, text0, text1_text_anchor_value, g_class_value, g_transform_value;

		var if_block = (ctx.opts.gridlines !== false) && create_if_block_1(component, ctx);

		return {
			c() {
				g = createSvgElement("g");
				if (if_block) if_block.c();
				text1 = createSvgElement("text");
				text0 = createText(text0_value);
				setAttribute(text1, "y", "16");
				setAttribute(text1, "text-anchor", text1_text_anchor_value = ctx.textAnchor(ctx.i));
				setAttribute(text1, "class", "svelte-1fce8tb");
				setAttribute(g, "class", g_class_value = "tick tick-" + ctx.tick + " svelte-1fce8tb");
				setAttribute(g, "transform", g_transform_value = "translate(" + ctx.$xScale(ctx.tick) + "," + ctx.$yScale.range()[0] + ")");
			},

			m(target, anchor) {
				insert(target, g, anchor);
				if (if_block) if_block.m(g, null);
				append(g, text1);
				append(text1, text0);
			},

			p(changed, ctx) {
				if (ctx.opts.gridlines !== false) {
					if (if_block) {
						if_block.p(changed, ctx);
					} else {
						if_block = create_if_block_1(component, ctx);
						if_block.c();
						if_block.m(g, text1);
					}
				} else if (if_block) {
					if_block.d(1);
					if_block = null;
				}

				if ((changed.opts || changed.ticks) && text0_value !== (text0_value = ctx.opts.formatTick ? ctx.opts.formatTick(ctx.tick) : ctx.tick)) {
					setData(text0, text0_value);
				}

				if ((changed.textAnchor) && text1_text_anchor_value !== (text1_text_anchor_value = ctx.textAnchor(ctx.i))) {
					setAttribute(text1, "text-anchor", text1_text_anchor_value);
				}

				if ((changed.ticks) && g_class_value !== (g_class_value = "tick tick-" + ctx.tick + " svelte-1fce8tb")) {
					setAttribute(g, "class", g_class_value);
				}

				if ((changed.$xScale || changed.ticks || changed.$yScale) && g_transform_value !== (g_transform_value = "translate(" + ctx.$xScale(ctx.tick) + "," + ctx.$yScale.range()[0] + ")")) {
					setAttribute(g, "transform", g_transform_value);
				}
			},

			d(detach) {
				if (detach) {
					detachNode(g);
				}

				if (if_block) if_block.d();
			}
		};
	}

	// (10:2) {#if opts.baseline === true}
	function create_if_block$1(component, ctx) {
		var line, line_y__value, line_y__value_1;

		return {
			c() {
				line = createSvgElement("line");
				setAttribute(line, "class", "baseline svelte-1fce8tb");
				setAttribute(line, "y1", line_y__value = ctx.$height + 0.5);
				setAttribute(line, "y2", line_y__value_1 = ctx.$height + 0.5);
				setAttribute(line, "x1", "0");
				setAttribute(line, "x2", ctx.$width);
			},

			m(target, anchor) {
				insert(target, line, anchor);
			},

			p(changed, ctx) {
				if ((changed.$height) && line_y__value !== (line_y__value = ctx.$height + 0.5)) {
					setAttribute(line, "y1", line_y__value);
				}

				if ((changed.$height) && line_y__value_1 !== (line_y__value_1 = ctx.$height + 0.5)) {
					setAttribute(line, "y2", line_y__value_1);
				}

				if (changed.$width) {
					setAttribute(line, "x2", ctx.$width);
				}
			},

			d(detach) {
				if (detach) {
					detachNode(line);
				}
			}
		};
	}

	function AxisX(options) {
		init(this, options);
		this._state = assign(this.store._init(["xScale","yScale","height","width"]), options.data);
		this.store._add(this, ["xScale","yScale","height","width"]);

		this._recompute({ $xScale: 1, opts: 1, ticks: 1 }, this._state);
		this._intro = true;

		this._handlers.destroy = [removeFromStore];

		if (!document.getElementById("svelte-1fce8tb-style")) add_css$7();

		this._fragment = create_main_fragment$7(this, this._state);

		if (options.target) {
			this._fragment.c();
			this._mount(options.target, options.anchor);
		}
	}

	assign(AxisX.prototype, proto);

	AxisX.prototype._recompute = function _recompute(changed, state) {
		if (changed.$xScale || changed.opts) {
			if (this._differs(state.ticks, (state.ticks = ticks$1(state)))) changed.ticks = true;
		}

		if (changed.ticks || changed.opts) {
			if (this._differs(state.textAnchor, (state.textAnchor = textAnchor(state)))) changed.textAnchor = true;
		}
	};

	/* layer-cake-example/layercake-Line/src/components/AxisY.html generated by Svelte v2.16.1 */

	function add_css$8() {
		var style = createElement("style");
		style.id = 'svelte-1fqtd9f-style';
		style.textContent = ".tick.svelte-1fqtd9f{font-size:.725em;font-weight:200}.tick.svelte-1fqtd9f line.svelte-1fqtd9f{stroke:#aaa;stroke-dasharray:2}.tick.svelte-1fqtd9f text.svelte-1fqtd9f{fill:#666;text-anchor:start}.tick.tick-0.svelte-1fqtd9f line.svelte-1fqtd9f{stroke-dasharray:0}";
		append(document.head, style);
	}

	function get_each_context$4(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.tick = list[i];
		child_ctx.i = i;
		return child_ctx;
	}

	function create_main_fragment$8(component, ctx) {
		var g, g_transform_value;

		var each_value = ctx.$yScale.ticks(ctx.opts.ticks || ctx.opts.tickNumber || 5);

		var each_blocks = [];

		for (var i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block$4(component, get_each_context$4(ctx, each_value, i));
		}

		return {
			c() {
				g = createSvgElement("g");

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}
				setAttribute(g, "class", "axis y-axis");
				setAttribute(g, "transform", g_transform_value = "translate(-" + ctx.$padding.left + ", 0)");
			},

			m(target, anchor) {
				insert(target, g, anchor);

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].m(g, null);
				}
			},

			p(changed, ctx) {
				if (changed.$yScale || changed.opts) {
					each_value = ctx.$yScale.ticks(ctx.opts.ticks || ctx.opts.tickNumber || 5);

					for (var i = 0; i < each_value.length; i += 1) {
						const child_ctx = get_each_context$4(ctx, each_value, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
						} else {
							each_blocks[i] = create_each_block$4(component, child_ctx);
							each_blocks[i].c();
							each_blocks[i].m(g, null);
						}
					}

					for (; i < each_blocks.length; i += 1) {
						each_blocks[i].d(1);
					}
					each_blocks.length = each_value.length;
				}

				if ((changed.$padding) && g_transform_value !== (g_transform_value = "translate(-" + ctx.$padding.left + ", 0)")) {
					setAttribute(g, "transform", g_transform_value);
				}
			},

			d(detach) {
				if (detach) {
					detachNode(g);
				}

				destroyEach(each_blocks, detach);
			}
		};
	}

	// (4:6) {#if opts.gridlines !== false}
	function create_if_block$2(component, ctx) {
		var line;

		return {
			c() {
				line = createSvgElement("line");
				setAttribute(line, "x2", "100%");
				setAttribute(line, "class", "svelte-1fqtd9f");
			},

			m(target, anchor) {
				insert(target, line, anchor);
			},

			d(detach) {
				if (detach) {
					detachNode(line);
				}
			}
		};
	}

	// (2:2) {#each $yScale.ticks(opts.ticks || opts.tickNumber || 5) as tick, i}
	function create_each_block$4(component, ctx) {
		var g, text1, text0_value = ctx.opts.formatTick ? ctx.opts.formatTick(ctx.tick) : ctx.tick, text0, g_class_value, g_transform_value;

		var if_block = (ctx.opts.gridlines !== false) && create_if_block$2();

		return {
			c() {
				g = createSvgElement("g");
				if (if_block) if_block.c();
				text1 = createSvgElement("text");
				text0 = createText(text0_value);
				setAttribute(text1, "y", "-4");
				setAttribute(text1, "class", "svelte-1fqtd9f");
				setAttribute(g, "class", g_class_value = "tick tick-" + ctx.tick + " svelte-1fqtd9f");
				setAttribute(g, "transform", g_transform_value = "translate(0, " + ctx.$yScale(ctx.tick) + ")");
			},

			m(target, anchor) {
				insert(target, g, anchor);
				if (if_block) if_block.m(g, null);
				append(g, text1);
				append(text1, text0);
			},

			p(changed, ctx) {
				if (ctx.opts.gridlines !== false) {
					if (!if_block) {
						if_block = create_if_block$2();
						if_block.c();
						if_block.m(g, text1);
					}
				} else if (if_block) {
					if_block.d(1);
					if_block = null;
				}

				if ((changed.opts || changed.$yScale) && text0_value !== (text0_value = ctx.opts.formatTick ? ctx.opts.formatTick(ctx.tick) : ctx.tick)) {
					setData(text0, text0_value);
				}

				if ((changed.$yScale || changed.opts) && g_class_value !== (g_class_value = "tick tick-" + ctx.tick + " svelte-1fqtd9f")) {
					setAttribute(g, "class", g_class_value);
				}

				if ((changed.$yScale || changed.opts) && g_transform_value !== (g_transform_value = "translate(0, " + ctx.$yScale(ctx.tick) + ")")) {
					setAttribute(g, "transform", g_transform_value);
				}
			},

			d(detach) {
				if (detach) {
					detachNode(g);
				}

				if (if_block) if_block.d();
			}
		};
	}

	function AxisY(options) {
		init(this, options);
		this._state = assign(this.store._init(["padding","yScale"]), options.data);
		this.store._add(this, ["padding","yScale"]);
		this._intro = true;

		this._handlers.destroy = [removeFromStore];

		if (!document.getElementById("svelte-1fqtd9f-style")) add_css$8();

		this._fragment = create_main_fragment$8(this, this._state);

		if (options.target) {
			this._fragment.c();
			this._mount(options.target, options.anchor);
		}
	}

	assign(AxisY.prototype, proto);

	const myCake = new LayerCakeStore({
	  padding: { right: 10, bottom: 20, left: 25 },
	  x: 'myX',
	  y: d => d['myY'],
	  yDomain: [0, null],
	  data: points,
	  target: document.getElementById('my-chart')
	})
	  .svgLayers([
	    { component: AxisX, opts: {} },
	    { component: AxisY, opts: {} },
	    { component: Line, opts: {} },
	    { component: Area, opts: {} }
	  ]);

	myCake.render();

}());
//# sourceMappingURL=bundle.js.map
