---
title: 使用 Xposed 进行黑盒测试
date: 2016-07-14 12:02:08
tags: [Android, Java, Xposed]
categories: Android
thumbnail: /2016/07/14/Black-box-test-using-Xposed/logo.png
---

现在的 Android App 在编译发行时，一般都会混淆代码，或者加密保护 dex，虽然能够有效防止打包客反编译修改后重新发行，但也给我们个人学习 Dalvik 指令和理解程序逻辑带来了很大麻烦。在做静态分析时，面对茫茫一片混淆后无规则的类名，往往难以下手，只能停留在一些 APP 的常见入口，无法继续深入。

Xposed 是 Android 上非常有名的一个 hook 框架。通过 Xposed，可以轻松勾住 Java 层的所有方法。hook 的应用非常广泛，包括资源替换、系统优化、性能分析等，下面就与大家分享一下我利用 Xposed 分析混淆代码应用的一些心得。

<!--more-->

### 如何 hook

Xposed 替换了 `app_process (Zygote)`，将 Java 方法改为 Native 方法骗过虚拟机，从而拿到 Java 方法的代理权。所以首先得明白，Xposed 只能 hook Java 方法。虽然原理很复杂，但是 Xposed 提供给 module 开发者的 API 还是很简单方便的，请参考 Xposed repo 上的[指导](https://github.com/rovo89/XposedBridge/wiki/Development-tutorial)和完整的 [API 文档](http://api.xposed.info/reference/packages.html)，常见的使用如：

```java
/* Hook org.apache.http 包中的 HttpPost 请求 */
XposedHelpers.findAndHookMethod("org.apache.http.impl.client.AbstractHttpClient", loadPackageParam.classLoader, "execute", HttpUriRequest.class, new XC_MethodHook() {

    @Override
    protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
        if (!param.args[0].getClass().getCanonicalName().contains("HttpPost")) {
            return;
        }
        HttpPost request = (HttpPost) param.args[0];

        String url = request.getURI().toString();
    }
}
```

Xposed 通过 Java 虚拟机的反射 API来找目标类和方法，所以要**注意你只能 hook 具体实现的方法**，除此之外，交由子类实现的抽象方法、在子类中被重写且没有被调用的父类方法、和继承自父类但没有重写的子类方法，是不能 hook 的。虽然 Dalvik 有 `invoke-virtual` 指令，但实际虚拟机中对象的每个方法都是独立唯一的，与父类的方法没有链式调用的关系（，不过对象的构造方法和显式调用 `super()` 除外）。

举一个实际中的例子，比如说你想 hook `java.net.HttpURLConnection` 的 `getInputStream()` 方法，来做一些流量统计或者内容嗅探等工作。一般来说是这样写的：

```java
/* 错误示范 */
XposedHelpers.findAndHookMethod("java.net.HttpURLConnection", loadPackageParam.classLoader, "getInputStream", new XC_MethodHook() {

    @Override
    protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
        /* Do something */
    }
}
```

但这样会报错，Xposed 日志会显示找不到该方法。根据文档，这个 `getInputStream()` 方法是继承自它的父类 `java.net.URLConnection` 的方法，在 `java.net.HttpURLConnection` 中并没有重写。但如果将上面的目标类改成 `java.net.URLConnection` 依然会 hook 失败。原因请看下面 `java.net.URLConnection` 中 `getInputStream()` 部分的源码：

```java
/**
 * Returns an {@code InputStream} for reading data from the resource pointed by
 * this {@code URLConnection}. It throws an UnknownServiceException by
 * default. This method must be overridden by its subclasses.
 *
 * @return the InputStream to read data from.
 * @throws IOException
 *             if no InputStream could be created.
 */
public InputStream getInputStream() throws IOException {
    throw new UnknownServiceException("Does not support writing to the input stream");
}
```

可以看出基类 `java.net.URLConnection` 并没有实现这个方法。在实际中，HTTP 请求的处理是由系统 framework 层中一些平台相关的实现类来具体实现的。

所以应该 hook 实现类中的方法，具体如下。

```java
final int apiLevel = Build.VERSION.SDK_INT;
/* 自 Android 4.4 后改用 okhttp 实现，在 6.0 后包名有改动 */
if (apiLevel >= 23) {
    XposedHelpers.findAndHookMethod("com.android.okhttp.internal.huc.HttpURLConnectionImpl", loadPackageParam.classLoader, "getInputStream", URLGetInputStreamHook);
} else if (apiLevel >= 19) {
    XposedHelpers.findAndHookMethod("com.android.okhttp.internal.http.HttpURLConnectionImpl", loadPackageParam.classLoader, "getInputStream", URLGetInputStreamHook);
} else {
    XposedHelpers.findAndHookMethod("libcore.net.http.HttpURLConnectionImpl", loadPackageParam.classLoader, "getInputStream", URLGetInputStreamHook);
}
```

### Hook 系统 API

你可以 hook 一些敏感的系统 API，打印出参数和返回结果，从而获取到一些关键信息。

比如说 HTTP 请求中的 payload、`startActivity()` 中传递的 Intent，块加密的密钥等敏感内容。

```java
XposedHelpers.findAndHookConstructor("java.net.URL", loadPackageParam.classLoader, String.class, new XC_MethodHook() {
    @Override
    protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
        String url = (String) param.args[0];
        log("URL construct " + url);
        /* 还可以通过修改参数或结果，改变应用逻辑 */
        param.args[0] = "http://www.baidu.com/";
        log("Change URL to " + param.args[0]);
    }
});
```

### 打印栈跟踪信息

新建一个 `Exception`，把当前应用方法调用的栈跟踪信息打印出来。对于混淆后的代码，这招相当有用，可以快速定位反汇编后的关键点，理清类之间调用关系，对理解程序的逻辑很有帮助。

```java
XposedHelpers.findAndHookConstructor("java.net.URL", loadPackageParam.classLoader, String.class, new XC_MethodHook() {
    @Override
    protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
        /* 打印调用栈跟踪信息 */
        new Exception("new URL").printStackTrace();
        /* 记录到 Xposed 日志 */
        XposedBridge.log(new Exception("new URL"));
    }
});
```

### Hook 异常信息

应用运行过程中产生的异常往往包含了一些重要信息，而这些异常通常会被捕获且不会将异常 log 内容打印出来。这时就可以通过 Xposed 来 hook 异常的构造方法，得到异常跟踪信息。Java 的异常类通过继承来实现异常的层级化归类，且子类在构造时会调用父类的构造方法，所以我们可以通过 hook 异常基类来实现对一大类异常的捕获，如：

```java
XposedBridge.hookAllConstructors(IOException.class, new XC_MethodHook() {
    @Override
    protected void afterHookedMethod(MethodHookParam param) throws Throwable {
        /* 所有网络 IO，本地 IO 等 IO 错误都会被捕获 */
        XposedBridge.log((Throwable) param.thisObject);
    }
});
```

### 最后

暂时先记录这么多，以后有想起什么再另行补充，欢迎大家留言指正。