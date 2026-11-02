package com.hybridflow.connection.controller;

import com.hybridflow.notification.dto.request.TelegramDestinationRequest;
import com.hybridflow.notification.dto.response.TelegramBotInfoResponse;
import com.hybridflow.notification.dto.response.TelegramLinkResponse;
import com.hybridflow.notification.dto.response.TelegramRecipientResponse;
import com.hybridflow.notification.dto.response.TelegramTestResponse;
import com.hybridflow.notification.service.TelegramSetupService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/connections/telegram")
@RequiredArgsConstructor
public class TelegramConnectionController {
    private final TelegramSetupService setup;

    @GetMapping("/bot")
    public TelegramBotInfoResponse bot() { return setup.botInfo(); }

    @PostMapping("/link")
    public TelegramLinkResponse link(@RequestBody TelegramDestinationRequest request) { return setup.startLink(request.getRecipientType()); }

    @GetMapping("/link/{id}")
    public TelegramLinkResponse linkStatus(@PathVariable String id) { return setup.poll(id); }

    @PostMapping("/recipient")
    public TelegramRecipientResponse recipient(@RequestBody TelegramDestinationRequest request) { return setup.checkRecipient(request.getChatId(), request.getRecipientType()); }

    @PostMapping("/test")
    public TelegramTestResponse test(@RequestBody TelegramDestinationRequest request) { return setup.sendTest(request.getChatId(), request.getRecipientType()); }
}
