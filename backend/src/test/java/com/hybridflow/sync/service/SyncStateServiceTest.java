package com.hybridflow.sync.service;

import com.hybridflow.sync.model.SyncFlowBinding;
import com.hybridflow.sync.repository.SyncFlowBindingRepository;
import com.hybridflow.sync.repository.SyncStateRepository;
import com.hybridflow.sync.service.impl.SyncStateServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SyncStateServiceTest {
    @Mock SyncStateRepository repository;
    @Mock SyncFlowBindingRepository bindingRepository;
    @InjectMocks SyncStateServiceImpl service;

    private SyncFlowBinding binding() {
        return new SyncFlowBinding("flow", "sheet", "Data", "id", List.of("id", "status"), "vault");
    }

    @Test
    void firstBindingIsPersistedThroughTheRepository() {
        when(bindingRepository.findByFlowId("flow")).thenReturn(Optional.empty());
        service.bind("flow", "sheet", "Data", "id", List.of("id", "status"), "vault");
        verify(bindingRepository).save(argThat(binding -> binding.getFlowId().equals("flow")
                && binding.getSpreadsheetId().equals("sheet") && binding.getHeaders().equals(List.of("id", "status"))));
    }

    @Test
    void anExistingBindingCannotSilentlySwitchDataSources() {
        when(bindingRepository.findByFlowId("flow")).thenReturn(Optional.of(binding()));
        assertThrows(IllegalArgumentException.class,
                () -> service.bind("flow", "another-sheet", "Data", "id", List.of("id", "status"), "vault"));
        verify(bindingRepository, never()).save(any());
    }

    @Test
    void anExistingBindingCannotSilentlyChangeItsSchema() {
        when(bindingRepository.findByFlowId("flow")).thenReturn(Optional.of(binding()));
        assertThrows(IllegalArgumentException.class,
                () -> service.bind("flow", "sheet", "Data", "id", List.of("id", "price"), "vault"));
        verify(bindingRepository, never()).save(any());
    }

    @Test
    void matchingBindingsAreReusedWithoutOverwritingThem() {
        when(bindingRepository.findByFlowId("flow")).thenReturn(Optional.of(binding()));
        service.bind("flow", "sheet", "Data", "id", List.of("id", "status"), "vault");
        verify(bindingRepository, never()).save(any());
    }
}
