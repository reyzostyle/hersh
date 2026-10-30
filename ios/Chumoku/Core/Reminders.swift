import UserNotifications

// "Your new ideas are here", once a day, at the moment the next drop opens
// (DailyDrop.nextAt). A local notification: it needs no push server, and the
// drop time is already on the phone. Permission is asked the first time
// someone saves an idea, when they have just seen what the ideas are worth,
// not on the first screen.
enum Reminders {
    private static let id = "daily-drop"

    static func askOnce() async {
        let center = UNUserNotificationCenter.current()
        guard await center.notificationSettings().authorizationStatus == .notDetermined else { return }
        _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
    }

    static func schedule(at date: Date?) async {
        guard let date, date > .now else { return }
        let center = UNUserNotificationCenter.current()
        guard await center.notificationSettings().authorizationStatus == .authorized else { return }
        let content = UNMutableNotificationContent()
        content.title = String(localized: "New ideas are in")
        content.body = String(localized: "Today's Shorts that beat their channel, remade for yours.")
        content.sound = .default
        let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        let request = UNNotificationRequest(identifier: id, content: content,
                                            trigger: UNCalendarNotificationTrigger(dateMatching: parts, repeats: false))
        // Same id: each drop replaces the last reminder instead of stacking.
        try? await center.add(request)
    }
}
