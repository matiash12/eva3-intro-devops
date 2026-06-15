package com.eva3.backend.controller;

import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class ApiController {

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of(
            "status", "UP",
            "service", "eva3-backend",
            "timestamp", LocalDateTime.now().toString()
        );
    }

    @GetMapping("/students")
    public List<Map<String, Object>> getStudents() {
        return List.of(
            Map.of("id", 1, "nombre", "Ana García", "curso", "ISY1101", "nota", 6.5),
            Map.of("id", 2, "nombre", "Carlos López", "curso", "ISY1101", "nota", 5.8),
            Map.of("id", 3, "nombre", "María Fernández", "curso", "ISY1101", "nota", 7.0),
            Map.of("id", 4, "nombre", "Pedro Soto", "curso", "ISY1101", "nota", 6.1),
            Map.of("id", 5, "nombre", "Valentina Muñoz", "curso", "ISY1101", "nota", 6.9)
        );
    }
}
