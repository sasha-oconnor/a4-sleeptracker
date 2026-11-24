--Readme document for Sasha O'Connor, aleksano@uci.edu, 80009764 (aleksano) --
Assignment Group Number: A4 Group 89

1. How many assignment points do you believe you completed (replace the *'s with your numbers)?

11/10
- 1/1 The ability to log overnight sleep
- 1/1 The ability to log sleepiness during the day
- 1/1 The ability to view these two categories of logged data
- 3/2 Either using a native device resource or backing up logged data (both Local Notifications and Ionic Storage)
- 2/2 Following good principles of mobile design
- 2/2 Creating a compelling app
- 1/1 A readme and demo video which explains how these features were implemented and their design rationale

2. How long, in hours, did it take you to complete this assignment?

Probably about 12 - 15 hours. 

3. What online resources did you consult when completing this assignment? (list specific URLs)

- Ionic components and APIs (datetime, modal, item-sliding, toast): https://ionicframework.com/docs/components, https://ionicframework.com/docs/api/datetime, https://ionicframework.com/docs/api/modal, https://ionicframework.com/docs/api/item-sliding, https://ionicframework.com/docs/api/toast
- Ionic theming and dark mode: https://ionicframework.com/docs/theming/colors, https://ionicframework.com/docs/theming/dark-mode
- Capacitor plugins: https://capacitorjs.com/docs/apis/local-notifications, https://capacitorjs.com/docs/apis/haptics, https://capacitorjs.com/docs/apis/share
- Ionic Storage: https://github.com/ionic-team/ionic-storage
- Angular signals: https://angular.dev/guide/signals
- Stanford Sleepiness Scale: https://www.med.upenn.edu/cbti/assets/user-content/documents/Stanford%20Sleepiness%20Scale.pdf
- Reminders for experience sampling: https://dl.acm.org/doi/10.1145/2470654.2466140
- Apple Human Interface Guidelines: https://developer.apple.com/design/human-interface-guidelines/tab-bars, https://developer.apple.com/design/human-interface-guidelines/modality
- Lecture 14 on mobile design principles: https://inf133-wi26.depstein.net/lectures/l14-mobile_sass.pdf
- Claude Code by Anthropic (https://claude.com/claude-code), was used to plan the app, draft different versions of modals and test the code. I also used Claude to help familiarize myself with Ionic and taught me how to implement features into the app similar to the lectures. Claude also created the svg favicon. 
- Impeccable, a design skill for Claude Code (https://impeccable.style, https://github.com/pbakaus/impeccable): used to critique each screen of the app and to guide fixes to the layout, wording, error prevention, and accessibility.

4. What classmates or other individuals did you consult as part of this assignment? What did you discuss?

None.

5. Is there anything special we need to know in order to run your code?

- In the sleeptracker folder, run "npm install" and then "ionic serve" (or "npm start"), then open http://localhost:8100. The app was tested with Node 24 (Angular 19 supports Node 18.19, 20.11, or 22 and newer).
- Drift is designed for a phone screen, so it looks best in Chrome DevTools device mode with an iPhone selected. In a wide browser window it stays a phone-width column in the middle of the screen, and in a browser it always uses Ionic's iOS style.
- To see Trends right away, tap "Explore with sample data" on the first screen (or "Load sample data" in Settings). The sample data is three weeks of made-up student sleep, and "Remove sample data" in Settings takes it out again.
- Reminders use browser notifications. Chrome asks for permission the first time a reminder is turned on in Settings, and "Send a test check-in" sends one after five seconds. In a browser, reminders only arrive while the Drift tab is open, and Windows Focus Assist (Do Not Disturb) can hide the pop-up.
- Everything is saved in the browser with Ionic Storage (IndexedDB), so it is still there after a reload. "Delete all data" in Settings starts over.
- demo.mp4 is one video. The first part is a walkthrough with captions, recorded in Chrome by a script written with Claude Code, and the last part (from 1:32) is a real screen recording of a Chrome notification on Windows being clicked to open the check-in screen. Timestamps are at the end of this file.


--Aim for no more than two sentences for each of the following questions.--


6. Did you design your app with a particular type of user in mind? If so, whom?

The app is designed for college students, whose sleep changes a lot between early classes, late study nights, and weekends. Logging has to be quick enough to do half-asleep in bed or while walking between classes, so the most common actions take one or two taps.

7. Did you design your app specifically for iOS or Android, or both?

Drift is designed for iOS and follows Apple's guidelines, with a bottom tab bar, large titles, sheets with Cancel and Save buttons, swipe actions, and the system font. In a browser it is locked to Ionic's iOS style so the demo matches an iPhone, and on an Android phone Ionic would switch to Android's own style.

8. How can a person log overnight sleep in your app? Why did you choose to support logging overnight sleep in this way?

A person can start a sleep timer at bedtime and tap the wake-up button in the morning, or log the night afterward by dragging a moon (bedtime) and a sun (wake-up) around a twenty-four-hour dial or by using the time pickers, with their usual times already filled in and labeled as defaults until they change them. Both options exist because some students remember to start a timer at night while others only think about sleep the next morning, and the dial cannot record an impossible night, meaning that a bedtime later than the wake-up time is automatically placed on the evening before.

9. How can a person log sleepiness during the day in your app? Why did you choose to support logging sleepiness in this way?

The Today screen shows the seven Stanford Sleepiness Scale levels as numbered buttons under the instruction "Tap a number to log how you feel right now," so one tap logs how sleepy the person feels, and the same card confirms the log with Undo and "Add context" buttons. "Add context" opens a detailed check-in screen with every official description, the time, and context such as "Before coffee" or "In class", because sleepiness changes several times a day and a quick log is much more likely to happen than a long form.

10. How can a person view the data they logged in your app? Why did you choose to support viewing logged data in this way?

The Journal tab lists every log by day with a filter for sleep or sleepiness, where tapping an entry edits it and swiping left deletes it. The Trends tab starts with a comparison of how sleepy the person felt after longer nights versus shorter ones, then shows the last seven or thirty days as charts and summary rows, because that connection is the main reason to track both kinds of data.

11. Which feature choose--using a native device resource, backing up logged data, or both?

Both.

12. If you used a native device resource, what feature did you add? How does this feature change the app's experience for a user?

Drift uses Capacitor Local Notifications to send check-in reminders at times the person chooses, which is a form of experience sampling, meaning that the app asks how sleepy they feel in the moment instead of relying on memory, and tapping a reminder opens the right logging screen. This turns logging into a five-second answer to a prompt instead of something a student has to remember, and the app also uses Capacitor Haptics for tap feedback on phones and Capacitor Share to send a weekly summary to a friend.

13. If you backed up logged data, where does it back up to?

Every log, setting, and running sleep timer is saved with Ionic Storage, which uses IndexedDB in the browser and on-device storage on a phone, so nothing is lost after a reload or restart. Settings also has an "Export a backup" button that downloads all logs as a JSON file.

14. How does your app implement or follow principles of good mobile design?

The Today screen is a useful initial view because it changes with the time of day (logging last night in the morning, a one-tap check-in during the day, and the sleep timer at night), and every log or delete shows an Undo button while edited forms ask before discarding changes, which covers the "uh-oh" button. Errors are prevented with time pickers, a dial that cannot run backward or past the current time, automatic overnight dates, and Save buttons that stay disabled until the input makes sense, and the app follows iOS conventions with a tab bar, sheets with Cancel and Save, swipe-to-delete, the system font, and one key color for everything that can be tapped.


Bonus features:
- Both a native device resource (Local Notifications, plus Haptics and Share) and saved data (Ionic Storage), plus a JSON backup export.
- A sleep timer that keeps running when the app is closed or reloaded.
- A draggable twenty-four-hour sleep dial that stays in sync with the time pickers.
- Editing and deleting any entry, with Undo after every change, including "Delete all data".
- Trends charts for seven or thirty days, and an insight that connects sleep length to next-day sleepiness.
- Reminders that skip a check-in right after the person logged one, and skip the morning reminder once last night is logged.
- Three weeks of sample data for trying out Trends.
- A phone-width layout in wide browser windows, so the app looks the same as it does on a phone.

Demo timestamps (the walkthrough is scripted, and the clock is moved forward for the reminder and the overnight timer):
- 0:00 First launch
- 0:04 Logging last night with the twenty-four-hour dial (log overnight sleep)
- 0:16 One-tap sleepiness check-in, then Undo, then adding context (log sleepiness)
- 0:27 Journal, swipe to delete, then Undo (view logged data)
- 0:35 Trends with three weeks of sample data (view logged data)
- 0:54 Turning on check-in reminders and sending a test reminder (native device resource)
- 1:02 Tapping the reminder opens the check-in screen
- 1:09 Reloading the page, with every log still saved (backing up logged data)
- 1:16 Sleep timer at bedtime, then logging the night in the morning
- 1:32 A real Chrome notification on Windows, clicked to open the check-in screen (native device resource)
