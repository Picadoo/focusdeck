use std::{collections::BTreeMap, sync::LazyLock};

static ZH: LazyLock<BTreeMap<String, String>> =
    LazyLock::new(|| serde_json::from_str(include_str!("../assets/zh.json")).unwrap());
static EN: LazyLock<BTreeMap<String, String>> =
    LazyLock::new(|| serde_json::from_str(include_str!("../assets/en.json")).unwrap());

pub fn tr(locale: &str, key: &str) -> String {
    let dictionary = if locale == "en" { &EN } else { &ZH };
    dictionary
        .get(key)
        .cloned()
        .unwrap_or_else(|| key.to_owned())
}

pub fn fmt(locale: &str, key: &str, values: &[(&str, String)]) -> String {
    let mut text = tr(locale, key);
    for (name, value) in values {
        text = text.replace(&format!("{{{name}}}"), value);
    }
    text
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dictionaries_have_identical_keys() {
        assert_eq!(ZH.keys().collect::<Vec<_>>(), EN.keys().collect::<Vec<_>>());
    }
}
