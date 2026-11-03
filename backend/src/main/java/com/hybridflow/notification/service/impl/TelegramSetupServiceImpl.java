package com.hybridflow.notification.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.common.exception.ValidationException;
import com.hybridflow.notification.client.TelegramApiClient;
import com.hybridflow.notification.dto.response.TelegramBotInfoResponse;
import com.hybridflow.notification.dto.response.TelegramLinkResponse;
import com.hybridflow.notification.dto.response.TelegramRecipientResponse;
import com.hybridflow.notification.dto.response.TelegramTestResponse;
import com.hybridflow.notification.service.TelegramSetupService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
@RequiredArgsConstructor
public class TelegramSetupServiceImpl implements TelegramSetupService {
    private final TelegramApiClient client;
    private final Map<String, LinkSession> sessions = new ConcurrentHashMap<>();
    private JsonNode cachedUpdates;
    private Instant lastRead = Instant.EPOCH;

    @Override
    public TelegramBotInfoResponse botInfo() {
        if (!client.isConfigured()) return new TelegramBotInfoResponse(false, null, null, false,
                "Bot Telegram chưa sẵn sàng. Liên hệ quản trị viên để thiết lập bot.");
        JsonNode bot = client.call("getMe", Map.of());
        String username = bot.path("username").asText();
        if (!username.matches("[A-Za-z0-9_]+")) throw new ApplicationException(ErrorCode.UPSTREAM_FAILURE, "Không lấy được thông tin bot. Vui lòng thử lại.");
        return new TelegramBotInfoResponse(true, username, bot.path("first_name").asText(), bot.path("can_join_groups").asBoolean(true), "Bot đã sẵn sàng.");
    }

    @Override
    public synchronized TelegramLinkResponse startLink(String recipientType) {
        validateType(recipientType);
        TelegramBotInfoResponse bot = botInfo();
        if (!bot.isConfigured()) throw new ApplicationException(ErrorCode.CONFIGURATION_ERROR, bot.getMessage());
        if ("GROUP".equals(recipientType) && !bot.isCanJoinGroups())
            throw new ValidationException("Bot chưa cho phép thêm vào nhóm. Liên hệ quản trị viên hoặc chọn Gửi cho tôi.");
        if (!client.call("getWebhookInfo", Map.of()).path("url").asText().isBlank())
            throw new ValidationException("Bot đang được dùng bởi một kết nối khác. Mở Thiết lập nâng cao để nhập nơi nhận, hoặc liên hệ quản trị viên.");
        Instant now = Instant.now();
        sessions.entrySet().removeIf(entry -> !entry.getValue().expiresAt.isAfter(now));
        if (sessions.size() >= 1000) throw new ApplicationException(ErrorCode.RATE_LIMITED, "Đang có nhiều yêu cầu kết nối. Vui lòng thử lại sau.");
        String id = UUID.randomUUID().toString().replace("-", "");
        LinkSession session = new LinkSession(id, recipientType, bot.getUsername(), now, now.plus(Duration.ofMinutes(10)));
        sessions.put(id, session);
        return response(session);
    }

    @Override
    public TelegramLinkResponse poll(String id) {
        LinkSession session = sessions.get(id);
        if (session == null) throw new ValidationException("Kết nối đã hết hạn. Tạo liên kết mới để thử lại.");
        synchronized (session) {
            if (!session.expiresAt.isAfter(Instant.now()) || session.recipient != null) return response(session);
            JsonNode updates = updates();
            for (JsonNode update : updates) {
                JsonNode message = update.path("message");
                if (message.has("forward_origin") || message.has("forward_date") || message.has("via_bot")) continue;
                String command = message.path("text").asText().trim();
                if (!command.equals("/start hf_" + session.id)
                        && !command.equals("/start@" + session.username + " hf_" + session.id)) continue;
                if (message.path("date").asLong() < session.createdAt.minusSeconds(30).getEpochSecond()) continue;
                JsonNode chat = message.path("chat");
                if (!matchesType(chat.path("type").asText(), session.recipientType)) continue;
                session.recipient = recipient(chat, session.recipientType);
                break;
            }
            return response(session);
        }
    }

    private synchronized JsonNode updates() {
        if (cachedUpdates == null || lastRead.plusSeconds(2).isBefore(Instant.now())) {
            // No offset or allowed_updates: do not acknowledge other messages or change the bot's delivery filter.
            cachedUpdates = client.call("getUpdates", Map.of("timeout", 0, "limit", 100));
            if (!cachedUpdates.isArray()) throw new ApplicationException(ErrorCode.UPSTREAM_FAILURE, "Không đọc được kết quả kết nối Telegram. Thử lại sau.");
            lastRead = Instant.now();
        }
        return cachedUpdates;
    }

    @Override
    public TelegramRecipientResponse checkRecipient(String chatId, String recipientType) {
        validateType(recipientType);
        if (chatId == null || !chatId.trim().matches("-?[0-9]{1,20}"))
            throw new ValidationException("Chat ID cần là mã số của cuộc trò chuyện Telegram.");
        JsonNode chat = client.call("getChat", Map.of("chat_id", chatId.trim()));
        if (!matchesType(chat.path("type").asText(), recipientType))
            throw new ValidationException("Nơi nhận không khớp lựa chọn. Chọn lại Gửi cho tôi hoặc Gửi vào nhóm.");
        return recipient(chat, recipientType);
    }

    @Override
    public TelegramTestResponse sendTest(String chatId, String recipientType) {
        TelegramRecipientResponse recipient = checkRecipient(chatId, recipientType);
        client.call("sendMessage", Map.of("chat_id", recipient.getChatId(), "text",
                "HybridFlow: Kết nối Telegram thành công. Đây là tin nhắn thử để kiểm tra nơi nhận cảnh báo dữ liệu."));
        return new TelegramTestResponse(true, "Đã gửi tin nhắn thử. Mở Telegram để kiểm tra.", recipient);
    }

    private TelegramRecipientResponse recipient(JsonNode chat, String type) {
        if (!chat.path("id").isIntegralNumber()) throw new ApplicationException(ErrorCode.UPSTREAM_FAILURE, "Telegram chưa trả về nơi nhận hợp lệ.");
        String name = "GROUP".equals(type) ? chat.path("title").asText()
                : (chat.path("first_name").asText() + " " + chat.path("last_name").asText()).trim();
        if (name.isBlank()) name = chat.path("username").asText("GROUP".equals(type) ? "Nhóm Telegram" : "Tài khoản Telegram");
        return new TelegramRecipientResponse(chat.path("id").asText(), name, type);
    }

    private boolean matchesType(String chatType, String recipientType) {
        return "PRIVATE".equals(recipientType) ? "private".equals(chatType)
                : "group".equals(chatType) || "supergroup".equals(chatType);
    }
    private void validateType(String type) {
        if (!"PRIVATE".equals(type) && !"GROUP".equals(type)) throw new ValidationException("Chọn nơi nhận cá nhân hoặc nhóm.");
    }
    private TelegramLinkResponse response(LinkSession session) {
        boolean expired = !session.expiresAt.isAfter(Instant.now());
        return new TelegramLinkResponse(session.id, expired ? "EXPIRED" : session.recipient == null ? "WAITING" : "CONNECTED",
                "https://t.me/" + session.username + ("GROUP".equals(session.recipientType) ? "?startgroup=" : "?start=") + "hf_" + session.id,
                "/start@" + session.username + " hf_" + session.id, session.expiresAt, expired ? null : session.recipient);
    }
    private static final class LinkSession {
        private final String id;
        private final String recipientType;
        private final String username;
        private final Instant createdAt;
        private final Instant expiresAt;
        private TelegramRecipientResponse recipient;
        private LinkSession(String id, String recipientType, String username, Instant createdAt, Instant expiresAt) {
            this.id = id; this.recipientType = recipientType; this.username = username;
            this.createdAt = createdAt; this.expiresAt = expiresAt;
        }
    }
}
