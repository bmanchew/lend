URL: https://github.com/vitejs/vite/issues/1984
---
[Skip to content](https://github.com/vitejs/vite/issues/1984#start-of-content)

You signed in with another tab or window. [Reload](https://github.com/vitejs/vite/issues/1984) to refresh your session.You signed out in another tab or window. [Reload](https://github.com/vitejs/vite/issues/1984) to refresh your session.You switched accounts on another tab or window. [Reload](https://github.com/vitejs/vite/issues/1984) to refresh your session.Dismiss alert

[vitejs](https://github.com/vitejs)/ **[vite](https://github.com/vitejs/vite)** Public

- Sponsor







# Sponsor vitejs/vite

- [Notifications](https://github.com/login?return_to=%2Fvitejs%2Fvite) You must be signed in to change notification settings
- [Fork\\
6.4k](https://github.com/login?return_to=%2Fvitejs%2Fvite)
- [Star\\
70.4k](https://github.com/login?return_to=%2Fvitejs%2Fvite)


# "vite-plugin-react can't detect preamble. Something is wrong." when using styled-components\#1984

[New issue](https://github.com/login?return_to=https://github.com/vitejs/vite/issues/1984)

[Jump to bottom](https://github.com/vitejs/vite/issues/1984#signed-out-banner-sign-up) Copy link

[New issue](https://github.com/login?return_to=https://github.com/vitejs/vite/issues/1984)

[Jump to bottom](https://github.com/vitejs/vite/issues/1984#signed-out-banner-sign-up) Copy link

Closed

Closed

["vite-plugin-react can't detect preamble. Something is wrong." when using styled-components](https://github.com/vitejs/vite/issues/1984#top)#1984

Copy link

Labels

[needs reproduction](https://github.com/vitejs/vite/issues?q=state%3Aopen%20label%3A%22needs%20reproduction%22)

[![@RichardWeug](https://avatars.githubusercontent.com/u/39901604?v=4&size=80)](https://github.com/RichardWeug)

## Description

[![@RichardWeug](https://avatars.githubusercontent.com/u/39901604?v=4&size=48)](https://github.com/RichardWeug)

[RichardWeug](https://github.com/RichardWeug)

opened [on Feb 11, 2021](https://github.com/vitejs/vite/issues/1984#issue-806661101)

## Describe the bug

When I'm rendering a styled component, I get the following error:

"Uncaught Error: vite-plugin-react can't detect preamble. Something is wrong. See [vitejs/vite-plugin-react#11 (comment)](https://github.com/vitejs/vite-plugin-react/issues/11#discussion_r430879201)"

## Reproduction

When creating a new project I don't run into this problem. However, I'm trying to integrate vite into my existing project. Everything seems to work fine, but when I render a styled-component it crashes.

## System Info

- `vite` version: "^2.0.0-beta.65"
- Operating System: macOS Big Sur
- Node version: v14.15.5
- Package manager (npm/yarn/pnpm) and version: npm 6.14.11

## Logs (Optional if provided reproduction)

vite:cache \[304\] /@vite/client +0ms

vite:time 1ms /@vite/client +25s

vite:load 7ms \[fs\] /assets/js/website.tsx +25s

vite:transform 22ms /assets/js/website.tsx +25s

vite:time 33ms /assets/js/website.tsx +33ms

vite:hmr \[file change\] var/cache/dev/profiler/index.csv +106ms

vite:hmr \[no modules matched\] var/cache/dev/profiler/index.csv +1ms

vite:hmr \[file change\] var/log/dev.log +0ms

vite:hmr \[no modules matched\] var/log/dev.log +0ms

vite:cache \[304\] /node\_modules/vite/dist/client/env.js +172ms

vite:time 1ms /node\_modules/vite/dist/client/env.js +139ms

vite:hmr \[file change\] var/cache/dev/profiler/index.csv +145ms

vite:hmr \[no modules matched\] var/cache/dev/profiler/index.csv +1ms

vite:cache \[304\] vite/dynamic-import-polyfill +15ms

vite:time 1ms /@id/vite/dynamic-import-polyfill +16ms

vite:load 2ms \[fs\] /assets/js/components/dashboard/Dashboard.tsx +181ms

vite:hmr \[self-accepts\] assets/js/components/dashboard/Dashboard.tsx +24ms

vite:transform 20ms /assets/js/components/dashboard/Dashboard.tsx +178ms

vite:time 23ms /assets/js/components/dashboard/Dashboard.tsx +23ms

vite:cache \[304\] /@react-refresh +29ms

vite:time 0ms /@react-refresh +5ms

vite:hmr \[file change\] var/cache/dev/profiler/index.csv +76ms

vite:hmr \[no modules matched\] var/cache/dev/profiler/index.csv +0ms

vite:hmr \[file change\] var/log/dev.log +0ms

vite:hmr \[no modules matched\] var/log/dev.log +0ms

vite:time 1ms /node\_modules/.vite/chunk.IXVMP6XR.js.map +103ms

vite:time 1ms /node\_modules/.vite/chunk.IXVMP6XR.js.map +60ms

vite:hmr \[file change\] var/log/dev.log +320ms

vite:hmr \[no modules matched\] var/log/dev.log +0m

👍1

## Activity

[![](https://avatars.githubusercontent.com/u/39901604?s=64&v=4)RichardWeug](https://github.com/RichardWeug)

added

[pending triage](https://github.com/vitejs/vite/issues?q=state%3Aopen%20label%3A%22pending%20triage%22)

[on Feb 11, 2021](https://github.com/vitejs/vite/issues/1984#event-4321490974)

[![yyx990803](https://avatars.githubusercontent.com/u/499550?u=dd9a9ba40daf29be7c310f7075e74251609b03f3&v=4&size=80)](https://github.com/yyx990803)

### yyx990803 commented on Feb 11, 2021

[![@yyx990803](https://avatars.githubusercontent.com/u/499550?u=dd9a9ba40daf29be7c310f7075e74251609b03f3&v=4&size=48)](https://github.com/yyx990803)

[yyx990803](https://github.com/yyx990803)

[on Feb 11, 2021](https://github.com/vitejs/vite/issues/1984#issuecomment-777835758)

Member

If a newly created project works as expected with `styled-components`, then you need to provide an actual reproduction.

[![](https://avatars.githubusercontent.com/u/499550?s=64&u=dd9a9ba40daf29be7c310f7075e74251609b03f3&v=4)yyx990803](https://github.com/yyx990803)

added

[needs reproduction](https://github.com/vitejs/vite/issues?q=state%3Aopen%20label%3A%22needs%20reproduction%22)

and removed

[pending triage](https://github.com/vitejs/vite/issues?q=state%3Aopen%20label%3A%22pending%20triage%22)

[on Feb 11, 2021](https://github.com/vitejs/vite/issues/1984#event-4322286290)

[![RichardWeug](https://avatars.githubusercontent.com/u/39901604?v=4&size=80)](https://github.com/RichardWeug)

### RichardWeug commented on Feb 11, 2021

[![@RichardWeug](https://avatars.githubusercontent.com/u/39901604?v=4&size=48)](https://github.com/RichardWeug)

[RichardWeug](https://github.com/RichardWeug)

[on Feb 11, 2021](https://github.com/vitejs/vite/issues/1984#issuecomment-778039006)

Author

I managed to reproduce my issue with a simple example. I pushed my code to the following repository:

[https://github.com/RichardWeug/vite-backend-integration-preamble-bug](https://github.com/RichardWeug/vite-backend-integration-preamble-bug)

I'm starting my webserver using PHP, using the following command:

**php -S localhost:8000**

I start vite using npx, using the following command:

**npx vite**

When you navigate to localhost:8000, it gives the error I described.

[![yyx990803](https://avatars.githubusercontent.com/u/499550?u=dd9a9ba40daf29be7c310f7075e74251609b03f3&v=4&size=80)](https://github.com/yyx990803)

### yyx990803 commented on Feb 12, 2021

[![@yyx990803](https://avatars.githubusercontent.com/u/499550?u=dd9a9ba40daf29be7c310f7075e74251609b03f3&v=4&size=48)](https://github.com/yyx990803)

[yyx990803](https://github.com/yyx990803)

[on Feb 12, 2021](https://github.com/vitejs/vite/issues/1984#issuecomment-778289660) · edited by [yyx990803](https://github.com/yyx990803)

Edits

Member

Ah, so you are serving the HTML over your PHP server. Unfortunately because of this, Vite plugins (in this case `@vitejs/plugin-react-refresh`) won't be able to inject its HTML modifications.

Since you are not using Node.js, you can't leverage Vite's programmatic API to inject those HTML modifications, so in this case you'll have to do it manually inject [this code](https://github.com/vitejs/vite/blob/main/packages/plugin-react-refresh/index.js#L24-L30) into your HTML:

```
<script type="module">
import RefreshRuntime from "/@react-refresh"
RefreshRuntime.injectIntoGlobalHook(window)
window.$RefreshReg$ = () => {}
window.$RefreshSig$ = () => (type) => type
window.__vite_plugin_react_preamble_installed__ = true
</script>
```

This isn't a bug per-se, but we probably want to consider how to improve that.

🎉1

[![](https://avatars.githubusercontent.com/u/499550?s=64&u=dd9a9ba40daf29be7c310f7075e74251609b03f3&v=4)yyx990803](https://github.com/yyx990803)

closed this as [completed](https://github.com/vitejs/vite/issues?q=is%3Aissue%20state%3Aclosed%20archived%3Afalse%20reason%3Acompleted) [on Feb 12, 2021](https://github.com/vitejs/vite/issues/1984#event-4325568144)

[![RichardWeug](https://avatars.githubusercontent.com/u/39901604?v=4&size=80)](https://github.com/RichardWeug)

### RichardWeug commented on Feb 12, 2021

[![@RichardWeug](https://avatars.githubusercontent.com/u/39901604?v=4&size=48)](https://github.com/RichardWeug)

[RichardWeug](https://github.com/RichardWeug)

[on Feb 12, 2021](https://github.com/vitejs/vite/issues/1984#issuecomment-778403608) · edited by [RichardWeug](https://github.com/RichardWeug)

Edits

Author

> Ah, so you are serving the HTML over your PHP server. Unfortunately because of this, Vite plugins (in this case `@vitejs/plugin-react-refresh`) won't be able to inject its HTML modifications.
>
> Since you are not using Node.js, you can't leverage Vite's programmatic API to inject those HTML modifications, so in this case you'll have to do it manually inject [this code](https://github.com/vitejs/vite/blob/main/packages/plugin-react-refresh/index.js#L24-L30) into your HTML:
>
> ```notranslate
> <script type="module">
> import RefreshRuntime from "/@react-refresh"
> RefreshRuntime.injectIntoGlobalHook(window)
> window.$RefreshReg$ = () => {}
> window.$RefreshSig$ = () => (type) => type
> window.__vite_plugin_react_preamble_installed__ = true
> </script>
>
> ```
>
> This isn't a bug per-se, but we probably want to consider how to improve that.

Thanks. I've added the code. However, this doesn't seem to fix the issue. I'm still getting the same error.

```
<script type="module">
    import RefreshRuntime from "/@react-refresh"
    RefreshRuntime.injectIntoGlobalHook(window)
    window.$RefreshReg$ = () => {}
    window.$RefreshSig$ = () => (type) => type
    window.__vite_plugin_react_preamble_installed__ = true
</script>
<script type="module" src="http://localhost:3000/@vite/client"></script>
<script type="module" src="http://localhost:3000/assets/js/website.js"></script>
```

[![yyx990803](https://avatars.githubusercontent.com/u/499550?u=dd9a9ba40daf29be7c310f7075e74251609b03f3&v=4&size=80)](https://github.com/yyx990803)

### yyx990803 commented on Feb 12, 2021

[![@yyx990803](https://avatars.githubusercontent.com/u/499550?u=dd9a9ba40daf29be7c310f7075e74251609b03f3&v=4&size=48)](https://github.com/yyx990803)

[yyx990803](https://github.com/yyx990803)

[on Feb 12, 2021](https://github.com/vitejs/vite/issues/1984#issuecomment-778420441)

Member

Hmm probably `import RefreshRuntime from "http://localhost:3000/@react-refresh"`

👍1

[![RichardWeug](https://avatars.githubusercontent.com/u/39901604?v=4&size=80)](https://github.com/RichardWeug)

### RichardWeug commented on Feb 12, 2021

[![@RichardWeug](https://avatars.githubusercontent.com/u/39901604?v=4&size=48)](https://github.com/RichardWeug)

[RichardWeug](https://github.com/RichardWeug)

[on Feb 12, 2021](https://github.com/vitejs/vite/issues/1984#issuecomment-778460212)

Author

Thanks. That fixes it! However, I'm getting a different error now: "Uncaught ReferenceError: global is not defined". Is there some sort of setup I'm missing?

👍1

[![sebastiandedeyne](https://avatars.githubusercontent.com/u/1561079?u=a7b299faa161c502722d45391a1568a8b7d6730e&v=4&size=80)](https://github.com/sebastiandedeyne)

### sebastiandedeyne commented on Mar 16, 2021

[![@sebastiandedeyne](https://avatars.githubusercontent.com/u/1561079?u=a7b299faa161c502722d45391a1568a8b7d6730e&v=4&size=48)](https://github.com/sebastiandedeyne)

[sebastiandedeyne](https://github.com/sebastiandedeyne)

[on Mar 16, 2021](https://github.com/vitejs/vite/issues/1984#issuecomment-800165962) · edited by [sebastiandedeyne](https://github.com/sebastiandedeyne)

Edits

> Thanks. That fixes it! However, I'm getting a different error now: "Uncaught ReferenceError: global is not defined". Is there some sort of setup I'm missing?

Declaring a `global` var before the scripts solved this for me.

```
<script>var global = window</script>
```

👍1

[![](https://avatars.githubusercontent.com/u/1158253?s=64&u=982bbc5fbc18057a71a387b8d0f610da287c8c9d&v=4)ElMassimo](https://github.com/ElMassimo)

mentioned this [on May 2, 2021](https://github.com/vitejs/vite/issues/1984#event-1110250276)

- [feat: Enable HMR for React components maxjacobson/seasoning#58](https://github.com/maxjacobson/seasoning/pull/58)


[![RPDeshaies](https://avatars.githubusercontent.com/u/6224111?u=658e9068040f0278b4f3a7e5189b965ff864b8b9&v=4&size=80)](https://github.com/RPDeshaies)

### RPDeshaies commented on Jun 17, 2021

[![@RPDeshaies](https://avatars.githubusercontent.com/u/6224111?u=658e9068040f0278b4f3a7e5189b965ff864b8b9&v=4&size=48)](https://github.com/RPDeshaies)

[RPDeshaies](https://github.com/RPDeshaies)

[on Jun 17, 2021](https://github.com/vitejs/vite/issues/1984#issuecomment-863487890)

> Since you are not using Node.js, you can't leverage Vite's programmatic API to inject those HTML modifications, so in this case you'll have to do it manually inject [this code](https://github.com/vitejs/vite/blob/main/packages/plugin-react-refresh/index.js#L24-L30) into your HTML:

Just wanted to chime and add that this error could also happen when using certain micro-frontend frameworks.

Since each micro front-end can be its own ViteJS app (and server), the HTML that the user sees might not be handled or served by Vite at all.

Vite might only serve an entry point that can be mounted if the root application decides that it should.

One thing I was thinking, without full knowledge about what is possible, is that the [code mentionned above](https://github.com/vitejs/vite/blob/main/packages/plugin-react-refresh/index.js#L24-L30) perhaps could be programmatically injected by JavaScript instead of being appended in the Vite HTML entry point so that fast refresh works even when the app is mounted on a different server than the Vite server.

That way, perhaps it could be possible to make it so that multiple Vite micro front-end all have independent fast refresh.

This could also be a manual step since it's an edge case like `import 'vite/fast-refresh'` inside the micro front-end.

(mostly thinking out loud here)

Tagging you [@csr632](https://github.com/csr632) after I read [this comment](https://github.com/vitejs/vite-plugin-react/pull/11#discussion_r430879201) where you mentioned you were looking for edge cases.

Other resources:

- [https://single-spa.js.org/](https://single-spa.js.org/)
- [https://single-spa.js.org/docs/ecosystem-vite/](https://single-spa.js.org/docs/ecosystem-vite/)

[![github-actions](https://avatars.githubusercontent.com/in/15368?v=4&size=80)](https://github.com/github-actions)

### github-actions commented on Jul 13, 2021

[![@github-actions](https://avatars.githubusercontent.com/in/15368?v=4&size=48)](https://github.com/github-actions)

[github-actions](https://github.com/apps/github-actions)

[on Jul 13, 2021](https://github.com/vitejs/vite/issues/1984#issuecomment-879482228)

This issue has been locked since it has been closed for more than 14 days.

If you have found a concrete bug or regression related to it, please open a new [bug report](https://github.com/vitejs/vite/issues/new/choose) with a reproduction against the latest Vite version. If you have any other comments you should join the chat at [Vite Land](https://chat.vitejs.dev/) or create a new [discussion](https://github.com/vitejs/vite/discussions).

[![](https://avatars.githubusercontent.com/in/15368?s=64&v=4)github-actions](https://github.com/apps/github-actions)

locked and limited conversation to collaborators [on Jul 13, 2021](https://github.com/vitejs/vite/issues/1984#event-5016786659)

[Sign up for free](https://github.com/signup?return_to=https://github.com/vitejs/vite/issues/1984)**to join this conversation on GitHub.** Already have an account? [Sign in to comment](https://github.com/login?return_to=https://github.com/vitejs/vite/issues/1984)

## Metadata

### Assignees

No one assigned

### Labels

[needs reproduction](https://github.com/vitejs/vite/issues?q=state%3Aopen%20label%3A%22needs%20reproduction%22)

### Type

No type

### Projects

No projects

### Milestone

No milestone

### Relationships

None yet

### Development

No branches or pull requests

### Participants

[![@yyx990803](https://avatars.githubusercontent.com/u/499550?s=64&u=dd9a9ba40daf29be7c310f7075e74251609b03f3&v=4)](https://github.com/yyx990803)[![@sebastiandedeyne](https://avatars.githubusercontent.com/u/1561079?s=64&u=a7b299faa161c502722d45391a1568a8b7d6730e&v=4)](https://github.com/sebastiandedeyne)[![@RPDeshaies](https://avatars.githubusercontent.com/u/6224111?s=64&u=658e9068040f0278b4f3a7e5189b965ff864b8b9&v=4)](https://github.com/RPDeshaies)[![@RichardWeug](https://avatars.githubusercontent.com/u/39901604?s=64&v=4)](https://github.com/RichardWeug)

## Issue actions

You can’t perform that action at this time.


"vite-plugin-react can't detect preamble. Something is wrong." when using styled-components · Issue #1984 · vitejs/vite