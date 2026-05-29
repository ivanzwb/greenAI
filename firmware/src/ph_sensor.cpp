#include "config.h"
#include "ph_sensor.h"

bool phRawLooksValid(int raw) {
    return raw > 20 && raw < 4080;
}

bool phReadOfficial(int* rawAvgOut, float* phOut) {
    int buf[10];
    for (int i = 0; i < 10; i++) {
        buf[i] = analogRead(PIN_PH);
        delay(2);
        yield();
    }

    for (int i = 0; i < 9; i++) {
        for (int j = i + 1; j < 10; j++) {
            if (buf[i] > buf[j]) {
                int t = buf[i];
                buf[i] = buf[j];
                buf[j] = t;
            }
        }
    }

    unsigned long sum = 0;
    for (int i = 2; i < 8; i++) {
        sum += (unsigned long)buf[i];
    }
    int rawAvg = (int)(sum / 6);

    float voltage = (float)sum * 3.3f / 4095.0f / 6.0f;
#if PH_USE_VOLTAGE_DIVIDER_3
    voltage *= 3.0f;
#endif
    float ph = PH_SLOPE * voltage + PH_OFFSET;
    ph = constrain(ph, 0.0f, 14.0f);

    if (rawAvgOut) *rawAvgOut = rawAvg;
    if (phOut)     *phOut     = ph;

    return phRawLooksValid(rawAvg);
}
