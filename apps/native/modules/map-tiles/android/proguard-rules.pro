# TileInterceptor.install reaches MapLibre through reflection, so that the module does not depend
# on it. R8 sees no call to these two methods in a release build and takes them out: keep them,
# with their names. Decision 077.
-keep class org.maplibre.android.MapLibre {
    public static org.maplibre.android.MapLibre getInstance(android.content.Context);
}
-keep class org.maplibre.android.module.http.HttpRequestUtil {
    public static void setOkHttpClient(okhttp3.Call$Factory);
}
