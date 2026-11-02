package com.hybridflow.notification.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.util.Map;

@Service
public class TelegramApiClient {
    @Value("${telegram.bot.token:}")
    private String botToken;
    private final RestClient restClient;
    private final ObjectMapper mapper;

    public TelegramApiClient(ObjectMapper mapper) {
        this.mapper = mapper;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10000);
        factory.setReadTimeout(15000);
        this.restClient = RestClient.builder().requestFactory(factory).build();
    }

    public boolean isConfigured() { return botToken != null && !botToken.isBlank(); }

    public JsonNode call(String method, Map<String, Object> body) {
        if (!isConfigured()) throw new IllegalArgumentException("Bot Telegram chưa sẵn sàng. Liên hệ quản trị viên để thiết lập bot.");
        try {
            JsonNode response = restClient.post().uri("https://api.telegram.org/bot" + botToken + "/" + method)
                    .body(body).retrieve().body(JsonNode.class);
            if (response == null || !response.path("ok").asBoolean()) {
                throw failure(response == null ? 0 : response.path("error_code").asInt(),
                        response == null ? "" : response.path("description").asText());
            }
            return response.path("result");
        } catch (RestClientResponseException ex) {
            String description = "";
            try { description = mapper.readTree(ex.getResponseBodyAsString()).path("description").asText(); }
            catch (Exception ignored) { /* Use a safe status-based message; never expose a token-bearing URL. */ }
            throw failure(ex.getStatusCode().value(), description);
        } catch (RestClientException ex) {
            throw new IllegalStateException("Không thể kết nối Telegram. Kiểm tra kết nối mạng rồi thử lại.");
        }
    }

    private IllegalArgumentException failure(int code, String description) {
        String message = switch (code) {
            case 401 -> "Bot Telegram chưa sẵn sàng. Liên hệ quản trị viên để kiểm tra kết nối bot.";
            case 403 -> "Bot chưa được phép gửi tin. Mở bot và bấm Start, hoặc thêm bot vào nhóm và cho phép gửi tin nhắn.";
            case 409 -> "Bot đang được kết nối ở nơi khác. Dùng thiết lập nâng cao hoặc liên hệ quản trị viên.";
            case 429 -> "Telegram đang giới hạn số lần thử. Đợi một lúc rồi thử lại.";
            case 400 -> description.toLowerCase(java.util.Locale.ROOT).contains("chat not found")
                    ? "Không tìm thấy nơi nhận. Mở bot và bấm Start, hoặc thêm bot vào nhóm rồi kết nối lại."
                    : "Telegram chưa chấp nhận nơi nhận này. Kiểm tra bot đã có trong cuộc trò chuyện và được phép gửi tin.";
            default -> "Telegram chưa xử lý được yêu cầu. Vui lòng thử lại.";
        };
        return new IllegalArgumentException(message);
    }
}
