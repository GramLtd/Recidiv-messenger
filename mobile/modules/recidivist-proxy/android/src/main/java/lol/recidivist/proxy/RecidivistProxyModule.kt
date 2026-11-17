package lol.recidivist.proxy

import android.content.Context
import com.facebook.react.modules.network.OkHttpClientProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import okhttp3.Credentials
import java.net.InetSocketAddress
import java.net.Proxy

/** HTTP / SOCKS5 proxy for all React Native networking (OkHttp). Applied at startup and on change. */
class RecidivistProxyModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RecidivistProxy")
    OnCreate { appContext.reactContext?.let { install(it) } }
    Function("setProxy") { cfg: Map<String, Any?> ->
      val ctx = appContext.reactContext ?: return@Function false
      ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        .putBoolean("enabled", cfg["enabled"] == true)
        .putString("type", cfg["type"]?.toString() ?: "socks5")
        .putString("host", cfg["host"]?.toString() ?: "")
        .putInt("port", cfg["port"]?.toString()?.toIntOrNull() ?: 0)
        .putString("user", cfg["user"]?.toString() ?: "")
        .putString("pass", cfg["pass"]?.toString() ?: "")
        .apply()
      install(ctx)
      false // the networking client is built once; changes apply after restart
    }
  }

  companion object {
    const val PREFS = "recidivist.proxy"
    fun install(ctx: Context) {
      val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      if (!p.getBoolean("enabled", false)) return
      val host = p.getString("host", "") ?: ""
      val port = p.getInt("port", 0)
      if (host.isEmpty() || port <= 0) return
      val type = if (p.getString("type", "socks5") == "http") Proxy.Type.HTTP else Proxy.Type.SOCKS
      val user = p.getString("user", "") ?: ""
      val pass = p.getString("pass", "") ?: ""
      if (type == Proxy.Type.SOCKS && user.isNotEmpty()) {
        java.net.Authenticator.setDefault(object : java.net.Authenticator() {
          override fun getPasswordAuthentication() = java.net.PasswordAuthentication(user, pass.toCharArray())
        })
      }
      OkHttpClientProvider.setOkHttpClientFactory {
        val b = OkHttpClientProvider.createClientBuilder().proxy(Proxy(type, InetSocketAddress.createUnresolved(host, port)))
        if (type == Proxy.Type.HTTP && user.isNotEmpty()) {
          b.proxyAuthenticator { _, response -> response.request.newBuilder().header("Proxy-Authorization", Credentials.basic(user, pass)).build() }
        }
        b.build()
      }
    }
  }
}
